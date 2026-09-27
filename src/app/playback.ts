import type { RobotConstants } from "./kotlinAutonFile";
import { FIELD_SIZE_INCHES, INITIAL_POINT_COLOR } from "./plannerConstants";
import type { AutonSequenceItem, Point, SimulationParameters } from "./plannerTypes";
import { DEFAULT_SIMULATION_PARAMETERS } from "./plannerStorage";
import { getPathSegments, normalizeHeading, samplePathSegments } from "./plannerUtils";

export type PlaybackPose = {
  nx: number;
  ny: number;
  heading: number;
  color?: string;
};

export type MotionProfile = {
  distance: number;
  acceleration: number;
  cruiseVelocity: number;
  brakeAcceleration: number;
  accelerationTime: number;
  cruiseTime: number;
  brakeTime: number;
  accelerationDistance: number;
  cruiseDistance: number;
};

export type PlaybackSegment =
  | {
      kind: "path";
      startTime: number;
      duration: number;
      point: Point;
      samples: PlaybackPose[];
      cumulativeDistances: number[];
      profile: MotionProfile;
      simulationFrames: Array<{ time: number; distance: number; heading: number }>;
    }
  | {
      kind: "wait";
      startTime: number;
      duration: number;
      pose: PlaybackPose;
    }
  | {
      kind: "rotate";
      startTime: number;
      duration: number;
      pose: PlaybackPose;
      point: Point;
      startHeading: number;
      endHeading: number;
    };

export type PlaybackTimeline = {
  segments: PlaybackSegment[];
  totalTime: number;
};

export const interpolateNumber = (start: number, end: number, t: number) => start + (end - start) * t;

export const interpolateHeading = (start: number, end: number, t: number) => {
  const delta = normalizeHeading(end - start);
  return normalizeHeading(start + delta * t);
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothInterpolationT = (t: number) => t * t * (3 - 2 * t);

export const interpolateHeadingRange = (start: number, end: number, t: number, startT = 0, endT = 1) => {
  const clampedStartT = clamp01(startT);
  const clampedEndT = clamp01(endT);
  if (clampedEndT <= clampedStartT) return t < clampedStartT ? normalizeHeading(start) : normalizeHeading(end);
  if (t <= clampedStartT) return normalizeHeading(start);
  if (t >= clampedEndT) return normalizeHeading(end);
  const localT = (t - clampedStartT) / (clampedEndT - clampedStartT);
  return interpolateHeading(start, end, smoothInterpolationT(localT));
};

const measureFieldDistance = (a: { nx: number; ny: number }, b: { nx: number; ny: number }) => {
  const ax = (a.nx - 0.5) * FIELD_SIZE_INCHES;
  const ay = (0.5 - a.ny) * FIELD_SIZE_INCHES;
  const bx = (b.nx - 0.5) * FIELD_SIZE_INCHES;
  const by = (0.5 - b.ny) * FIELD_SIZE_INCHES;
  return Math.hypot(bx - ax, by - ay);
};

export const safeMotionLimit = (value: number, fallback = 1) =>
  Number.isFinite(value) && Math.abs(value) > 0.001 ? Math.abs(value) : fallback;

const getDirectionalComponents = (
  dx: number,
  dy: number,
  heading: number
) => {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) return { forward: 1, strafe: 0 };

  const unitX = dx / distance;
  const unitY = dy / distance;
  const headingRadians = (heading * Math.PI) / 180;
  const forwardX = Math.sin(headingRadians);
  const forwardY = Math.cos(headingRadians);
  const lateralX = Math.cos(headingRadians);
  const lateralY = -Math.sin(headingRadians);
  return {
    forward: Math.abs(unitX * forwardX + unitY * forwardY),
    strafe: Math.abs(unitX * lateralX + unitY * lateralY),
  };
};

const getDirectionalVelocityLimit = (
  dx: number,
  dy: number,
  heading: number,
  forwardLimit: number,
  strafeLimit: number
) => {
  const components = getDirectionalComponents(dx, dy, heading);
  return 1 / (components.forward / forwardLimit + components.strafe / strafeLimit);
};

const getDirectionalAccelerationLimit = (
  dx: number,
  dy: number,
  heading: number,
  forwardLimit: number,
  strafeLimit: number
) => {
  const components = getDirectionalComponents(dx, dy, heading);
  return 1 / (
    Math.pow(components.forward, 3) / forwardLimit +
    Math.pow(components.strafe, 3) / strafeLimit
  );
};

const getPedroBrakingAcceleration = (
  dx: number,
  dy: number,
  heading: number,
  velocity: number,
  constants: RobotConstants
) => {
  const components = getDirectionalComponents(dx, dy, heading);
  const linear = constants.linearBrakeForward * Math.pow(components.forward, 2) +
    constants.linearBrakeStrafe * Math.pow(components.strafe, 2);
  const quadratic = constants.quadraticBrakeForward * Math.pow(components.forward, 3) +
    constants.quadraticBrakeStrafe * Math.pow(components.strafe, 3);
  const stoppingDistance = Math.max(
    1e-6,
    (quadratic * velocity * velocity + linear * velocity) * Math.max(1e-6, constants.brakeAggression)
  );
  return (velocity * velocity) / (2 * stoppingDistance);
};

const createMotionProfile = (
  distance: number,
  maxVelocity: number,
  acceleration: number,
  brakeAcceleration: number
): MotionProfile => {
  const safeDistance = Math.max(0, distance);
  const safeMaxVelocity = safeMotionLimit(maxVelocity);
  const safeAcceleration = Number.isFinite(acceleration)
    ? safeMotionLimit(acceleration)
    : Number.POSITIVE_INFINITY;
  const safeBrakeAcceleration = safeMotionLimit(brakeAcceleration, safeAcceleration);
  const peakVelocity = Number.isFinite(safeAcceleration)
    ? Math.sqrt(
        (2 * safeAcceleration * safeBrakeAcceleration * safeDistance) /
          (safeAcceleration + safeBrakeAcceleration)
      )
    : Math.sqrt(2 * safeBrakeAcceleration * safeDistance);
  const cruiseVelocity = Math.min(safeMaxVelocity, peakVelocity);
  const accelerationTime = Number.isFinite(safeAcceleration) ? cruiseVelocity / safeAcceleration : 0;
  const brakeTime = cruiseVelocity / safeBrakeAcceleration;
  const accelerationDistance = Number.isFinite(safeAcceleration)
    ? (cruiseVelocity * cruiseVelocity) / (2 * safeAcceleration)
    : 0;
  const brakeDistance = (cruiseVelocity * cruiseVelocity) / (2 * safeBrakeAcceleration);
  const cruiseDistance = Math.max(0, safeDistance - accelerationDistance - brakeDistance);
  const cruiseTime = cruiseDistance / cruiseVelocity;

  return {
    distance: safeDistance,
    acceleration: safeAcceleration,
    cruiseVelocity,
    brakeAcceleration: safeBrakeAcceleration,
    accelerationTime,
    cruiseTime,
    brakeTime,
    accelerationDistance,
    cruiseDistance,
  };
};

export const getMotionProfileDuration = (profile: MotionProfile) =>
  profile.accelerationTime + profile.cruiseTime + profile.brakeTime;

export const getMotionProfileDistanceAtTime = (profile: MotionProfile, time: number) => {
  const safeTime = Math.max(0, Math.min(time, getMotionProfileDuration(profile)));
  if (profile.accelerationTime > 0 && safeTime <= profile.accelerationTime) {
    return 0.5 * profile.acceleration * safeTime * safeTime;
  }

  const cruiseEndTime = profile.accelerationTime + profile.cruiseTime;
  if (safeTime <= cruiseEndTime) {
    return profile.accelerationDistance + profile.cruiseVelocity * (safeTime - profile.accelerationTime);
  }

  const brakeElapsed = safeTime - cruiseEndTime;
  return Math.min(
    profile.distance,
    profile.accelerationDistance +
      profile.cruiseDistance +
      profile.cruiseVelocity * brakeElapsed -
      0.5 * profile.brakeAcceleration * brakeElapsed * brakeElapsed
  );
};

const getSampleHeadingAtDistance = (
  samples: PlaybackPose[],
  cumulativeDistances: number[],
  distance: number
) => {
  const foundEndIndex = cumulativeDistances.findIndex((value) => value >= distance);
  const safeEndIndex = foundEndIndex < 0 ? cumulativeDistances.length - 1 : Math.max(1, foundEndIndex);
  const startIndex = Math.max(0, safeEndIndex - 1);
  const startDistance = cumulativeDistances[startIndex] ?? 0;
  const endDistance = cumulativeDistances[safeEndIndex] ?? startDistance;
  const localT = endDistance > startDistance ? clamp01((distance - startDistance) / (endDistance - startDistance)) : 0;
  return interpolateHeading(samples[startIndex]?.heading ?? 0, samples[safeEndIndex]?.heading ?? 0, localT);
};

const cosineScale = (error: number, tolerance: number) => {
  const safeTolerance = Math.max(1e-6, Math.abs(tolerance));
  const radians = Math.min(Math.abs(error) * ((Math.PI / 2) / safeTolerance), Math.PI / 2);
  return Math.cos(radians);
};

const headingVelocityForError = (errorDegrees: number, constants: RobotConstants) => {
  const error = Math.abs(errorDegrees) * (Math.PI / 180);
  if (error <= 1e-9) return 0;
  const linear = Math.max(0, Math.abs(constants.headingBrakeLinear));
  const quadratic = Math.max(0, Math.abs(constants.headingBrakeQuadratic));
  let brakingVelocity: number;
  if (quadratic > 1e-9) {
    brakingVelocity = (-linear + Math.sqrt(linear * linear + 4 * quadratic * error)) / (2 * quadratic);
  } else if (linear > 1e-9) {
    brakingVelocity = error / linear;
  } else {
    brakingVelocity = error;
  }
  const feedbackPower = Math.min(1, Math.abs(constants.headingFeedback * (errorDegrees * Math.PI / 180)));
  return brakingVelocity * feedbackPower * (180 / Math.PI);
};

const simulatePedroHeading = (
  profile: MotionProfile,
  samples: PlaybackPose[],
  cumulativeDistances: number[],
  initialHeading: number,
  constants: RobotConstants,
  angularAcceleration: number
) => {
  const step = 1 / 100;
  const profileDuration = getMotionProfileDuration(profile);
  const frames = [{ time: 0, distance: 0, heading: normalizeHeading(initialHeading) }];
  let elapsed = 0;
  let profileTime = 0;
  let heading = normalizeHeading(initialHeading);
  let angularVelocity = 0;
  let holdElapsed = 0;
  const timeoutSeconds = Math.max(0, constants.timeoutConstraint) / 1000;

  while (elapsed < 120) {
    const distance = getMotionProfileDistanceAtTime(profile, profileTime);
    const targetHeading = getSampleHeadingAtDistance(samples, cumulativeDistances, distance);
    const headingError = normalizeHeading(targetHeading - heading);
    const targetAngularVelocity = Math.sign(headingError) * headingVelocityForError(headingError, constants);
    const maxAngularVelocityChange = safeMotionLimit(angularAcceleration) * step;
    angularVelocity += Math.max(
      -maxAngularVelocityChange,
      Math.min(maxAngularVelocityChange, targetAngularVelocity - angularVelocity)
    );
    heading = normalizeHeading(heading + angularVelocity * step);

    let driveScale = 1;
    if (constants.cosineScale && Math.abs(headingError) > constants.headingDeviationTolerance) {
      driveScale = constants.turnBeforeDriving
        ? 0
        : cosineScale(headingError, constants.headingDeviationTolerance);
    }
    if (profileTime < profileDuration) {
      profileTime = Math.min(profileDuration, profileTime + step * driveScale);
    } else {
      holdElapsed += step;
    }

    elapsed += step;
    const nextDistance = getMotionProfileDistanceAtTime(profile, profileTime);
    frames.push({ time: elapsed, distance: nextDistance, heading });

    const finalHeading = samples[samples.length - 1]?.heading ?? heading;
    const headingComplete = Math.abs(normalizeHeading(finalHeading - heading)) <= constants.headingConstraint;
    if (profileTime >= profileDuration && (headingComplete || holdElapsed >= timeoutSeconds)) break;
  }

  return frames;
};

export const buildPlaybackTimeline = (
  points: Point[],
  orderedSequenceItems: AutonSequenceItem[],
  robotConstants: RobotConstants,
  simulationParameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS
): PlaybackTimeline => {
  const maxForwardVelocity = safeMotionLimit(robotConstants.maxAchievableForwardVelocity);
  const maxLateralVelocity = safeMotionLimit(robotConstants.maxAchievableStrafeVelocity);
  const forwardBrakeAcceleration = safeMotionLimit(robotConstants.naturalForwardDeceleration);
  const lateralBrakeAcceleration = safeMotionLimit(robotConstants.naturalStrafeDeceleration);
  const accelerationConstraint = Math.min(
    safeMotionLimit(simulationParameters.translationalAcceleration),
    robotConstants.maxAccelerationConstraint !== null
      ? safeMotionLimit(robotConstants.maxAccelerationConstraint)
      : Number.POSITIVE_INFINITY
  );
  const velocityConstraint = robotConstants.maxVelocityConstraint !== null
    ? safeMotionLimit(robotConstants.maxVelocityConstraint)
    : Number.POSITIVE_INFINITY;
  const decelerationConstraint = robotConstants.maxDecelerationConstraint !== null
    ? safeMotionLimit(robotConstants.maxDecelerationConstraint)
    : Number.POSITIVE_INFINITY;
  const decelerationScale = robotConstants.maxDecelerationScale !== null
    ? Math.min(1, safeMotionLimit(robotConstants.maxDecelerationScale))
    : 1;
  const segments: PlaybackSegment[] = [];
  let elapsedTime = 0;
  let currentPose: PlaybackPose = {
    nx: points[0]?.nx ?? 0.5,
    ny: points[0]?.ny ?? 0.5,
    heading: points[0]?.heading ?? 0,
    color: points[0]?.color ?? INITIAL_POINT_COLOR,
  };

  orderedSequenceItems.forEach((item) => {
    if (item.kind === "action") {
      if (item.mode === "run" && item.timeout > 0) {
        segments.push({
          kind: "wait",
          startTime: elapsedTime,
          duration: item.timeout,
          pose: currentPose,
        });
        elapsedTime += item.timeout;
      }
      return;
    }

    const pointIndex = points.findIndex((point) => point.id === item.pointId);
    const point = points[pointIndex];
    const previousPoint = points[pointIndex - 1];
    if (!point || !previousPoint) return;

    const positionSamples = samplePathSegments(previousPoint, getPathSegments(point), 32).map((sample) => ({
      nx: sample.x,
      ny: sample.y,
    }));
    const headingMode = point.headingMode ?? "constant";
    const samples = positionSamples.map((sample, index) => {
      const t = index / Math.max(1, positionSamples.length - 1);
      let heading = point.constantHeading ?? 0;
      if (headingMode === "linear") {
        heading = interpolateHeadingRange(
          point.startHeading ?? 0,
          point.endHeading ?? 0,
          t,
          point.linearStartT ?? 0,
          point.linearEndT ?? 1
        );
      } else if (headingMode === "tangential") {
        const nextSample = positionSamples[Math.min(positionSamples.length - 1, index + 1)];
        const previousSample = positionSamples[Math.max(0, index - 1)];
        const dx = (nextSample.nx - previousSample.nx) * FIELD_SIZE_INCHES;
        const dy = (previousSample.ny - nextSample.ny) * FIELD_SIZE_INCHES;
        heading = normalizeHeading((Math.atan2(dx, dy) * 180) / Math.PI);
        if (point.tangentReversed) heading = normalizeHeading(heading + 180);
      }

      return { nx: sample.nx, ny: sample.ny, heading };
    });
    const cumulativeDistances = [0];
    const motionLimits = positionSamples.slice(1).reduce(
      (limits, sample, index) => {
        const previousSample = positionSamples[index];
        const segmentDistance = measureFieldDistance(previousSample, sample);
        cumulativeDistances.push(cumulativeDistances[cumulativeDistances.length - 1] + segmentDistance);
        if (segmentDistance <= 0.001) return limits;

        const dx = (sample.nx - previousSample.nx) * FIELD_SIZE_INCHES;
        const dy = (previousSample.ny - sample.ny) * FIELD_SIZE_INCHES;
        const heading = samples[index]?.heading ?? point.constantHeading ?? 0;
        return {
          maxVelocity: Math.min(
            limits.maxVelocity,
            velocityConstraint,
            getDirectionalVelocityLimit(dx, dy, heading, maxForwardVelocity, maxLateralVelocity)
          ),
          acceleration: accelerationConstraint,
          brakeAcceleration: Math.min(
            limits.brakeAcceleration,
            decelerationConstraint,
            getPedroBrakingAcceleration(
              dx,
              dy,
              heading,
              getDirectionalVelocityLimit(dx, dy, heading, maxForwardVelocity, maxLateralVelocity),
              robotConstants
            ),
            getDirectionalAccelerationLimit(dx, dy, heading, forwardBrakeAcceleration, lateralBrakeAcceleration) * decelerationScale
          ),
        };
      },
      {
        maxVelocity: Math.min(velocityConstraint, Math.max(maxForwardVelocity, maxLateralVelocity)),
        acceleration: accelerationConstraint,
        brakeAcceleration: Math.max(forwardBrakeAcceleration, lateralBrakeAcceleration),
      }
    );
    const distance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

    if (distance > 0.001) {
      const profile = createMotionProfile(
        distance,
        motionLimits.maxVelocity,
        motionLimits.acceleration,
        motionLimits.brakeAcceleration
      );
      const simulationFrames = simulatePedroHeading(
        profile,
        samples,
        cumulativeDistances,
        currentPose.heading,
        robotConstants,
        simulationParameters.angularAcceleration
      );
      const duration = Math.max(simulationFrames[simulationFrames.length - 1]?.time ?? 0, 0.001);

      segments.push({
        kind: "path",
        startTime: elapsedTime,
        duration,
        point,
        samples,
        cumulativeDistances,
        profile,
        simulationFrames,
      });
      elapsedTime += duration;
      const finalSimulatedHeading = simulationFrames[simulationFrames.length - 1]?.heading;
      currentPose = {
        ...(samples[samples.length - 1] ?? currentPose),
        heading: finalSimulatedHeading ?? samples[samples.length - 1]?.heading ?? currentPose.heading,
        color: point.color,
      };
    }
  });

  return { segments, totalTime: elapsedTime };
};

export const getPlaybackPoseAtTime = (
  timeline: PlaybackTimeline,
  clampedPlaybackTime: number,
  points: Point[]
) => {
  const initialPose: PlaybackPose = {
    nx: points[0]?.nx ?? 0.5,
    ny: points[0]?.ny ?? 0.5,
    heading: points[0]?.heading ?? 0,
    color: points[0]?.color ?? INITIAL_POINT_COLOR,
  };
  const activeSegment =
    timeline.segments.find(
      (segment) => clampedPlaybackTime >= segment.startTime && clampedPlaybackTime <= segment.startTime + segment.duration
    ) ?? timeline.segments[timeline.segments.length - 1];
  if (!activeSegment) return { pose: initialPose, activeSegment: undefined };
  if (activeSegment.kind === "wait") return { pose: activeSegment.pose, activeSegment };
  if (activeSegment.kind === "rotate") {
    const t = Math.max(0, Math.min(1, (clampedPlaybackTime - activeSegment.startTime) / activeSegment.duration));
    return {
      pose: {
        ...activeSegment.pose,
        heading: interpolateHeading(activeSegment.startHeading, activeSegment.endHeading, t),
      },
      activeSegment,
    };
  }

  const segmentTime = clampedPlaybackTime - activeSegment.startTime;
  const foundFrameEndIndex = activeSegment.simulationFrames.findIndex((frame) => frame.time >= segmentTime);
  const safeFrameEndIndex = foundFrameEndIndex < 0
    ? activeSegment.simulationFrames.length - 1
    : Math.max(1, foundFrameEndIndex);
  const frameStart = activeSegment.simulationFrames[Math.max(0, safeFrameEndIndex - 1)];
  const frameEnd = activeSegment.simulationFrames[safeFrameEndIndex] ?? frameStart;
  const frameT = frameEnd.time > frameStart.time
    ? clamp01((segmentTime - frameStart.time) / (frameEnd.time - frameStart.time))
    : 0;
  const pathDistance = interpolateNumber(frameStart.distance, frameEnd.distance, frameT);
  const startIndex = Math.max(
    0,
    activeSegment.cumulativeDistances.findIndex((distance) => distance >= pathDistance) - 1
  );
  const endIndex = Math.min(activeSegment.samples.length - 1, startIndex + 1);
  const startDistance = activeSegment.cumulativeDistances[startIndex] ?? 0;
  const endDistance = activeSegment.cumulativeDistances[endIndex] ?? startDistance;
  const localT =
    endDistance > startDistance ? Math.max(0, Math.min(1, (pathDistance - startDistance) / (endDistance - startDistance))) : 0;
  const startSample = activeSegment.samples[startIndex] ?? initialPose;
  const endSample = activeSegment.samples[endIndex] ?? startSample;
  const heading = interpolateHeading(frameStart.heading, frameEnd.heading, frameT);

  return {
    pose: {
      nx: interpolateNumber(startSample.nx, endSample.nx, localT),
      ny: interpolateNumber(startSample.ny, endSample.ny, localT),
      heading,
      color: activeSegment.point.color,
    },
    activeSegment,
  };
};

/**
 * Whether the robot's whole footprint fits inside the field walls at a pose.
 * Path points are clamped by their centre, so a point placed against a wall
 * still leaves half the robot buried in it.
 */
export const isRobotInsideField = (
  pose: { nx: number; ny: number; heading: number },
  robotWidth: number,
  robotLength: number
) => {
  const centerX = (clamp01(pose.nx) - 0.5) * FIELD_SIZE_INCHES;
  const centerY = (0.5 - clamp01(pose.ny)) * FIELD_SIZE_INCHES;
  const headingRadians = (pose.heading * Math.PI) / 180;
  // A dimension that never parsed is no reason to call every pose illegal, so
  // fall back to checking the centre alone.
  const safeDimension = (value: number) => (Number.isFinite(value) ? Math.abs(value) : 0);
  const halfWidth = safeDimension(robotWidth) / 2;
  const halfLength = safeDimension(robotLength) / 2;
  // Heading 0 faces +y, so forward is (sin, cos) and lateral is a quarter turn from it.
  const forwardX = Math.sin(headingRadians);
  const forwardY = Math.cos(headingRadians);
  const halfBound = FIELD_SIZE_INCHES / 2;
  // A rectangle only leaves an axis-aligned box through a corner.
  const reachX = Math.abs(halfLength * forwardX) + Math.abs(halfWidth * forwardY);
  const reachY = Math.abs(halfLength * forwardY) + Math.abs(halfWidth * forwardX);

  return (
    Math.abs(centerX) + reachX <= halfBound + 0.01 && Math.abs(centerY) + reachY <= halfBound + 0.01
  );
};

/** How long an FTC match's autonomous period lasts. */
export const AUTONOMOUS_PERIOD_SECONDS = 30;

export const getAutonomousOvertime = (totalTime: number) =>
  Math.max(0, (Number.isFinite(totalTime) ? totalTime : 0) - AUTONOMOUS_PERIOD_SECONDS);

/**
 * A hairline over the segment gradient at the moment the autonomous period runs
 * out, so an over-budget auton shows exactly which path it stops partway through.
 */
const createAutonomousDeadlineMarker = (totalTime: number) => {
  if (getAutonomousOvertime(totalTime) <= 0) return null;

  const deadlinePercent = ((AUTONOMOUS_PERIOD_SECONDS / totalTime) * 100).toFixed(3);
  const at = (offsetPixels: number) =>
    `calc(${deadlinePercent}% ${offsetPixels < 0 ? "-" : "+"} ${Math.abs(offsetPixels)}px)`;
  // A dark core between white flanks, so the marker reads against both the pale
  // path colors and the dim grey the waits are drawn in.
  return `linear-gradient(to right, transparent ${at(-1.5)}, #ffffff ${at(-1.5)}, #ffffff ${at(-0.5)}, #111827 ${at(-0.5)}, #111827 ${at(0.5)}, #ffffff ${at(0.5)}, #ffffff ${at(1.5)}, transparent ${at(1.5)})`;
};

/**
 * Seconds each path costs the auton. Pedro changes heading while following the
 * curve, so heading interpolation does not create a separate rotation segment.
 */
export const getPathDurationsByPointId = (timeline: PlaybackTimeline) => {
  const durations = new Map<string, number>();

  timeline.segments.forEach((segment) => {
    if (segment.kind === "wait") return;
    durations.set(segment.point.id, (durations.get(segment.point.id) ?? 0) + segment.duration);
  });

  return durations;
};

const ROTATE_BOUNDS_SAMPLE_COUNT = 16;

/**
 * Paths on which the robot clips a field wall somewhere along the way. The
 * canvas only shows the violation at the scrubbed instant, so this is what
 * lets the editor point at the path that needs moving.
 */
export const getOutOfBoundsPointIds = (
  timeline: PlaybackTimeline,
  robotWidth: number,
  robotLength: number,
  startPoint?: Point
) => {
  const pointIds = new Set<string>();
  const fits = (pose: { nx: number; ny: number; heading: number }) =>
    isRobotInsideField(pose, robotWidth, robotLength);

  // The start pose has no segment of its own, and an auton that begins with the
  // robot inside a wall never gets to run at all.
  if (startPoint && !fits({ ...startPoint, heading: startPoint.heading ?? 0 })) {
    pointIds.add(startPoint.id);
  }

  timeline.segments.forEach((segment) => {
    if (segment.kind === "wait") return;

    if (segment.kind === "path") {
      if (!segment.samples.every(fits)) pointIds.add(segment.point.id);
      return;
    }

    // Turning in place sweeps the corners out, so the endpoints alone miss it.
    const sweptHeadings = Array.from({ length: ROTATE_BOUNDS_SAMPLE_COUNT + 1 }, (_, index) =>
      interpolateHeading(segment.startHeading, segment.endHeading, index / ROTATE_BOUNDS_SAMPLE_COUNT)
    );
    if (!sweptHeadings.every((heading) => fits({ ...segment.pose, heading }))) {
      pointIds.add(segment.point.id);
    }
  });

  return pointIds;
};

export const createPlaybackTrackBackground = (timeline: PlaybackTimeline) => {
  if (timeline.totalTime <= 0) return "rgba(148, 163, 184, 0.35)";

  const stops: string[] = [];
  timeline.segments.forEach((segment) => {
    const startPercent = (segment.startTime / timeline.totalTime) * 100;
    const endPercent = ((segment.startTime + segment.duration) / timeline.totalTime) * 100;
    const segmentColor =
      segment.kind === "path"
        ? segment.point.color
        : segment.kind === "rotate"
          ? segment.point.color
          : "rgba(148, 163, 184, 0.35)";
    stops.push(`${segmentColor} ${startPercent.toFixed(3)}%`, `${segmentColor} ${endPercent.toFixed(3)}%`);
  });

  const segmentGradient = `linear-gradient(to right, ${stops.join(", ")})`;
  const deadlineMarker = createAutonomousDeadlineMarker(timeline.totalTime);
  return deadlineMarker ? `${deadlineMarker}, ${segmentGradient}` : segmentGradient;
};

export const snapSvgPixel = (value: number) => Math.round(value);

export const formatPlaybackTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, "0")}`;
};
