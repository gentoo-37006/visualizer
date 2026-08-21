import type { RobotConstants } from "./kotlinAutonFile";
import { FIELD_SIZE_INCHES, INITIAL_POINT_COLOR } from "./plannerConstants";
import type { AutonSequenceItem, MotionParameters, Point } from "./plannerTypes";
import { normalizeHeading } from "./plannerUtils";

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

const interpolateBezierPoint = (points: Array<{ nx: number; ny: number }>, t: number) => {
  let workingPoints = points.map((point) => ({ ...point }));

  while (workingPoints.length > 1) {
    workingPoints = workingPoints.slice(0, -1).map((point, index) => ({
      nx: interpolateNumber(point.nx, workingPoints[index + 1].nx, t),
      ny: interpolateNumber(point.ny, workingPoints[index + 1].ny, t),
    }));
  }

  return workingPoints[0];
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

const getDirectionalMotionLimit = (
  dx: number,
  dy: number,
  heading: number,
  forwardLimit: number,
  lateralLimit: number
) => {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) return Math.max(forwardLimit, lateralLimit);

  const unitX = dx / distance;
  const unitY = dy / distance;
  const headingRadians = (heading * Math.PI) / 180;
  const forwardX = Math.sin(headingRadians);
  const forwardY = Math.cos(headingRadians);
  const lateralX = Math.cos(headingRadians);
  const lateralY = -Math.sin(headingRadians);
  const forwardComponent = Math.abs(unitX * forwardX + unitY * forwardY);
  const lateralComponent = Math.abs(unitX * lateralX + unitY * lateralY);
  const limits = [];
  if (forwardComponent > 0.001) limits.push(forwardLimit / forwardComponent);
  if (lateralComponent > 0.001) limits.push(lateralLimit / lateralComponent);
  return Math.min(...limits);
};

const createMotionProfile = (
  distance: number,
  maxVelocity: number,
  acceleration: number,
  brakeAcceleration: number
): MotionProfile => {
  const safeDistance = Math.max(0, distance);
  const safeMaxVelocity = safeMotionLimit(maxVelocity);
  const safeAcceleration = safeMotionLimit(acceleration);
  const safeBrakeAcceleration = safeMotionLimit(brakeAcceleration, safeAcceleration);
  const peakVelocity = Math.sqrt(
    (2 * safeAcceleration * safeBrakeAcceleration * safeDistance) /
      (safeAcceleration + safeBrakeAcceleration)
  );
  const cruiseVelocity = Math.min(safeMaxVelocity, peakVelocity);
  const accelerationTime = cruiseVelocity / safeAcceleration;
  const brakeTime = cruiseVelocity / safeBrakeAcceleration;
  const accelerationDistance = (cruiseVelocity * cruiseVelocity) / (2 * safeAcceleration);
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
  if (safeTime <= profile.accelerationTime) {
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

export const buildPlaybackTimeline = (
  points: Point[],
  orderedSequenceItems: AutonSequenceItem[],
  robotConstants: RobotConstants,
  motionParameters: MotionParameters
): PlaybackTimeline => {
  const angularVelocity = safeMotionLimit(motionParameters.maxAngularVelocity);
  const maxForwardVelocity = safeMotionLimit(robotConstants.maxForwardVelocity);
  const maxLateralVelocity = safeMotionLimit(robotConstants.maxLateralVelocity);
  const maxForwardAcceleration = safeMotionLimit(motionParameters.maxForwardAcceleration);
  const maxLateralAcceleration = safeMotionLimit(motionParameters.maxLateralAcceleration);
  const forwardBrakeAcceleration = safeMotionLimit(robotConstants.forwardBrakeStrength, maxForwardAcceleration);
  const lateralBrakeAcceleration = safeMotionLimit(robotConstants.lateralBrakeStrength, maxLateralAcceleration);
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

    const bezierPoints = [
      previousPoint,
      ...(point.controlPoints ?? []),
      point,
    ].map((pathPoint) => ({ nx: pathPoint.nx, ny: pathPoint.ny }));
    const sampleCount = Math.max(48, (point.controlPoints?.length ?? 0) * 20);
    const positionSamples = Array.from({ length: sampleCount + 1 }, (_, index) =>
      interpolateBezierPoint(bezierPoints, index / sampleCount)
    );
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
            getDirectionalMotionLimit(dx, dy, heading, maxForwardVelocity, maxLateralVelocity)
          ),
          acceleration: Math.min(
            limits.acceleration,
            getDirectionalMotionLimit(dx, dy, heading, maxForwardAcceleration, maxLateralAcceleration)
          ),
          brakeAcceleration: Math.min(
            limits.brakeAcceleration,
            getDirectionalMotionLimit(dx, dy, heading, forwardBrakeAcceleration, lateralBrakeAcceleration)
          ),
        };
      },
      {
        maxVelocity: Math.max(maxForwardVelocity, maxLateralVelocity),
        acceleration: Math.max(maxForwardAcceleration, maxLateralAcceleration),
        brakeAcceleration: Math.max(forwardBrakeAcceleration, lateralBrakeAcceleration),
      }
    );
    const distance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
    const pathStartHeading = samples[0]?.heading ?? currentPose.heading;
    const rotateDegrees = Math.abs(normalizeHeading(pathStartHeading - currentPose.heading));
    if (rotateDegrees > 0.001) {
      const rotateDuration = rotateDegrees / angularVelocity;
      segments.push({
        kind: "rotate",
        startTime: elapsedTime,
        duration: rotateDuration,
        pose: currentPose,
        point,
        startHeading: currentPose.heading,
        endHeading: pathStartHeading,
      });
      elapsedTime += rotateDuration;
      currentPose = { ...currentPose, heading: pathStartHeading };
    }

    if (distance > 0.001) {
      const profile = createMotionProfile(
        distance,
        motionLimits.maxVelocity,
        motionLimits.acceleration,
        motionLimits.brakeAcceleration
      );
      const duration = Math.max(getMotionProfileDuration(profile), 0.001);

      segments.push({
        kind: "path",
        startTime: elapsedTime,
        duration,
        point,
        samples,
        cumulativeDistances,
        profile,
      });
      elapsedTime += duration;
      currentPose = {
        ...(samples[samples.length - 1] ?? currentPose),
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
  const pathDistance = getMotionProfileDistanceAtTime(activeSegment.profile, segmentTime);
  const startIndex = Math.max(
    0,
    activeSegment.cumulativeDistances.findIndex((distance) => distance >= pathDistance) - 1
  );
  const endIndex = Math.min(activeSegment.samples.length - 1, startIndex + 1);
  const startDistance = activeSegment.cumulativeDistances[startIndex] ?? 0;
  const endDistance = activeSegment.cumulativeDistances[endIndex] ?? startDistance;
  const localT =
    endDistance > startDistance ? Math.max(0, Math.min(1, (pathDistance - startDistance) / (endDistance - startDistance))) : 0;
  const bezierT = (startIndex + localT) / Math.max(1, activeSegment.samples.length - 1);
  const startSample = activeSegment.samples[startIndex] ?? initialPose;
  const endSample = activeSegment.samples[endIndex] ?? startSample;
  const headingMode = activeSegment.point.headingMode ?? "constant";
  const heading =
    headingMode === "linear"
      ? interpolateHeadingRange(
          activeSegment.point.startHeading ?? 0,
          activeSegment.point.endHeading ?? 0,
          bezierT,
          activeSegment.point.linearStartT ?? 0,
          activeSegment.point.linearEndT ?? 1
        )
      : interpolateHeading(startSample.heading, endSample.heading, localT);

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
 * Seconds each path costs the auton, counting the turn onto its start heading:
 * the sequence cannot skip that rotation, so it belongs to the path that needs it.
 */
export const getPathDurationsByPointId = (timeline: PlaybackTimeline) => {
  const durations = new Map<string, number>();

  timeline.segments.forEach((segment) => {
    if (segment.kind === "wait") return;
    durations.set(segment.point.id, (durations.get(segment.point.id) ?? 0) + segment.duration);
  });

  return durations;
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
