import type { RobotConstants } from "./kotlinAutonFile";
import { FIELD_SIZE_INCHES, INITIAL_POINT_COLOR } from "./plannerConstants";
import type { AutonSequenceItem, Point, SimulationParameters } from "./plannerTypes";
import { DEFAULT_SIMULATION_PARAMETERS } from "./plannerStorage";
import {
  getPathSegments,
  normalizeHeading,
  samplePathSegmentsWithParameters,
  type ParameterizedPathSample,
} from "./plannerUtils";

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
      simulationFrames: Array<{ time: number; distance: number; heading: number; velocity: number }>;
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

const findFirstIndexAtOrAfter = (
  length: number,
  valueAt: (index: number) => number,
  target: number
) => {
  if (length === 0 || valueAt(length - 1) < target) return -1;
  let low = 0;
  let high = length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (valueAt(middle) < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

export const interpolateHeadingRange = (start: number, end: number, t: number, startT = 0, endT = 1) => {
  const clampedStartT = clamp01(startT);
  const clampedEndT = clamp01(endT);
  if (clampedEndT <= clampedStartT) return t < clampedStartT ? normalizeHeading(start) : normalizeHeading(end);
  if (t <= clampedStartT) return normalizeHeading(start);
  if (t >= clampedEndT) return normalizeHeading(end);
  const localT = (t - clampedStartT) / (clampedEndT - clampedStartT);
  return interpolateHeading(start, end, localT);
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

const getPedroVelocityToBrakeInTime = (
  distanceRemaining: number,
  dx: number,
  dy: number,
  heading: number,
  constants: RobotConstants
) => {
  const components = getDirectionalComponents(dx, dy, heading);
  const k2 = constants.linearBrakeForward * Math.pow(components.forward, 2) +
    constants.linearBrakeStrafe * Math.pow(components.strafe, 2);
  const k1 = constants.quadraticBrakeForward * Math.pow(components.forward, 3) +
    constants.quadraticBrakeStrafe * Math.pow(components.strafe, 3);
  const distance = Math.abs(distanceRemaining) / Math.max(1e-6, constants.brakeAggression);
  const velocity = k1 > 1e-9
    ? (-k2 + Math.sqrt(k2 * k2 + 4 * k1 * distance)) / (2 * k1)
    : k2 > 1e-9
      ? distance / k2
      : 0;
  return velocity * Math.sign(distanceRemaining);
};

const cosineScale = (error: number, tolerance: number) => {
  const safeTolerance = Math.max(1e-6, Math.abs(tolerance));
  const radians = Math.min(Math.abs(error) * ((Math.PI / 2) / safeTolerance), Math.PI / 2);
  return Math.cos(radians);
};

const getHeadingBrakeDisplacement = (angularVelocityDegrees: number, constants: RobotConstants) => {
  const angularVelocity = angularVelocityDegrees * (Math.PI / 180);
  const displacement = angularVelocity * Math.abs(angularVelocity) * constants.headingBrakeQuadratic +
    angularVelocity * constants.headingBrakeLinear;
  return displacement * (180 / Math.PI);
};

const clampDrivePower = (power: number) => Math.max(-1, Math.min(1, power));

const getAngularVelocityToBrakeInTime = (errorDegrees: number, constants: RobotConstants) => {
  const error = Math.abs(errorDegrees) * (Math.PI / 180);
  if (error <= 1e-9) return 0;

  const linear = Math.max(0, Math.abs(constants.headingBrakeLinear));
  const quadratic = Math.max(0, Math.abs(constants.headingBrakeQuadratic));
  let velocity: number;
  if (quadratic > 1e-9) {
    velocity = (-linear + Math.sqrt(linear * linear + 4 * quadratic * error)) / (2 * quadratic);
  } else if (linear > 1e-9) {
    velocity = error / linear;
  } else {
    velocity = error;
  }
  return Math.sign(errorDegrees) * velocity * (180 / Math.PI);
};

type ForesightSample = PlaybackPose & ParameterizedPathSample;

const getSampleContextAtDistance = (
  samples: ForesightSample[],
  cumulativeDistances: number[],
  distance: number
) => {
  const foundEndIndex = findFirstIndexAtOrAfter(
    cumulativeDistances.length,
    (index) => cumulativeDistances[index],
    distance
  );
  const endIndex = foundEndIndex < 0 ? cumulativeDistances.length - 1 : Math.max(1, foundEndIndex);
  const startIndex = Math.max(0, endIndex - 1);
  const startDistance = cumulativeDistances[startIndex] ?? 0;
  const endDistance = cumulativeDistances[endIndex] ?? startDistance;
  const t = endDistance > startDistance ? clamp01((distance - startDistance) / (endDistance - startDistance)) : 0;
  const start = samples[startIndex] ?? samples[0];
  const end = samples[endIndex] ?? start;
  return {
    heading: interpolateHeading(start?.heading ?? 0, end?.heading ?? 0, t),
    pathT: interpolateNumber(start?.pathT ?? 0, end?.pathT ?? 0, t),
    localT: start?.segmentIndex === end?.segmentIndex
      ? interpolateNumber(start?.localT ?? 0, end?.localT ?? 0, t)
      : end?.localT ?? 0,
    segmentIndex: t < 1 ? start?.segmentIndex ?? 0 : end?.segmentIndex ?? 0,
    tangentX: interpolateNumber(start?.tangentX ?? 0, end?.tangentX ?? 0, t),
    tangentY: interpolateNumber(start?.tangentY ?? 0, end?.tangentY ?? 0, t),
  };
};

const getDirectionAtSample = (sample: Pick<ForesightSample, "tangentX" | "tangentY">) => {
  const magnitude = Math.hypot(sample.tangentX, sample.tangentY);
  if (magnitude <= 1e-9) return { dx: 0, dy: 1 };
  return { dx: sample.tangentX / magnitude, dy: -sample.tangentY / magnitude };
};

const getPedroBrakeDisplacement = (
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
  return Math.max(0, quadratic * velocity * velocity + linear * velocity);
};

const getDirectionalNaturalDeceleration = (
  dx: number,
  dy: number,
  heading: number,
  constants: RobotConstants
) => {
  const components = getDirectionalComponents(dx, dy, heading);
  const denominator = Math.pow(components.forward, 3) / safeMotionLimit(constants.naturalForwardDeceleration) +
    Math.pow(components.strafe, 3) / safeMotionLimit(constants.naturalStrafeDeceleration);
  return denominator > 1e-9 ? 1 / denominator : safeMotionLimit(constants.naturalForwardDeceleration);
};

const splitPedroHeadingPower = (
  projectedError: number,
  currentError: number,
  constants: RobotConstants
) => {
  const calculate = (error: number) => constants.headingFeedback * error * (Math.PI / 180);
  const total = calculate(projectedError);
  let feedback = calculate(currentError);
  let feedforward: number;

  if (Math.abs(total) <= 1e-3) {
    feedback = 0;
    feedforward = 0;
  } else if (total * feedback < 0) {
    feedforward = total;
    feedback = 0;
  } else if (Math.abs(feedback) >= Math.abs(total)) {
    feedforward = 0;
    feedback = total;
  } else {
    feedforward = total - feedback;
  }

  if (Math.abs(projectedError) > 1e-9) {
    feedforward += Math.sign(projectedError) * constants.headingStaticFeedforward;
  }
  feedforward += feedback * constants.headingDriveRatio;
  feedback *= 1 - constants.headingDriveRatio;

  return {
    feedforward: clampDrivePower(feedforward),
    feedback: clampDrivePower(feedback),
    total: clampDrivePower(feedforward + feedback),
  };
};

const createProfileSummary = (
  frames: Array<{ time: number; distance: number; velocity: number }>,
  distance: number,
  acceleration: number,
  brakeAcceleration: number
): MotionProfile => {
  const peakVelocity = frames.reduce((peak, frame) => Math.max(peak, frame.velocity), 0);
  const cruiseThreshold = peakVelocity * 0.995;
  const firstCruise = frames.findIndex((frame) => peakVelocity > 0 && frame.velocity >= cruiseThreshold);
  let lastCruise = -1;
  frames.forEach((frame, index) => {
    if (peakVelocity > 0 && frame.velocity >= cruiseThreshold) lastCruise = index;
  });
  const accelerationTime = firstCruise >= 0 ? frames[firstCruise].time : 0;
  const cruiseTime = firstCruise >= 0 && lastCruise >= firstCruise
    ? frames[lastCruise].time - frames[firstCruise].time
    : 0;
  const accelerationDistance = firstCruise >= 0 ? frames[firstCruise].distance : 0;
  const cruiseDistance = firstCruise >= 0 && lastCruise >= firstCruise
    ? frames[lastCruise].distance - accelerationDistance
    : 0;
  const finalTime = frames.at(-1)?.time ?? 0;

  return {
    distance,
    acceleration,
    cruiseVelocity: peakVelocity,
    brakeAcceleration,
    accelerationTime,
    cruiseTime,
    brakeTime: Math.max(0, finalTime - accelerationTime - cruiseTime),
    accelerationDistance,
    cruiseDistance,
  };
};

const simulateForesightPath = (
  samples: ForesightSample[],
  cumulativeDistances: number[],
  initialHeading: number,
  constants: RobotConstants,
  simulationParameters: SimulationParameters
) => {
  const step = 1 / 100;
  const totalDistance = cumulativeDistances.at(-1) ?? 0;
  const translationalAcceleration = safeMotionLimit(simulationParameters.translationalAcceleration);
  const angularAcceleration = safeMotionLimit(simulationParameters.angularAcceleration);
  const frames = [{ time: 0, distance: 0, heading: normalizeHeading(initialHeading), velocity: 0 }];
  let elapsed = 0;
  let distance = 0;
  let velocity = 0;
  let heading = normalizeHeading(initialHeading);
  let angularVelocity = 0;
  let holdElapsed = 0;
  const timeoutSeconds = Math.max(0, constants.timeoutConstraint) / 1000;
  let peakBrakeAcceleration = 0;

  while (elapsed < 120) {
    const sample = getSampleContextAtDistance(samples, cumulativeDistances, distance);
    const targetHeading = sample.heading;
    const headingError = normalizeHeading(targetHeading - heading);
    const direction = getDirectionAtSample(sample);
    const brakeDisplacement = getPedroBrakeDisplacement(
      direction.dx,
      direction.dy,
      heading,
      velocity,
      constants
    );
    const projectedDistance = Math.min(totalDistance, distance + brakeDisplacement);
    const projectedSample = getSampleContextAtDistance(samples, cumulativeDistances, projectedDistance);
    const projectedTargetHeading = projectedSample.heading;
    const projectedHeading = normalizeHeading(
      heading + getHeadingBrakeDisplacement(angularVelocity, constants)
    );
    const projectedHeadingError = normalizeHeading(projectedTargetHeading - projectedHeading);
    const headingPowers = splitPedroHeadingPower(projectedHeadingError, headingError, constants);
    const targetHeadingError = normalizeHeading(projectedTargetHeading - heading);
    const pedroBrakeVelocity = getAngularVelocityToBrakeInTime(targetHeadingError, constants);
    const inertiaLimitedVelocity = Math.sign(targetHeadingError) * Math.sqrt(
      2 * angularAcceleration * Math.abs(targetHeadingError)
    );
    const brakingVelocity = Math.abs(inertiaLimitedVelocity) < Math.abs(pedroBrakeVelocity)
      ? inertiaLimitedVelocity
      : pedroBrakeVelocity;
    const targetAngularVelocity = Math.sign(headingPowers.total) * Math.abs(brakingVelocity) * Math.abs(headingPowers.total);
    const maxAngularVelocityChange = angularAcceleration * step;
    angularVelocity += Math.max(
      -maxAngularVelocityChange,
      Math.min(maxAngularVelocityChange, targetAngularVelocity - angularVelocity)
    );
    heading = normalizeHeading(heading + angularVelocity * step);

    let driveScale = 1;
    if (constants.cosineScale) {
      const atParametricStart = projectedSample.localT <= constants.parametricTConstraint;
      if (atParametricStart && Math.abs(projectedHeadingError) > constants.headingDeviationTolerance) {
        driveScale = constants.turnBeforeDriving
          ? 0
          : cosineScale(projectedHeadingError, constants.headingDeviationTolerance);
      } else if (!atParametricStart && Math.abs(projectedHeadingError) > 2 * constants.headingDeviationTolerance) {
        driveScale = cosineScale(projectedHeadingError, constants.headingDeviationTolerance);
      }
    }

    const projectedDirection = getDirectionAtSample(projectedSample);
    const directionalMaxVelocity = getDirectionalVelocityLimit(
      projectedDirection.dx,
      projectedDirection.dy,
      heading,
      safeMotionLimit(constants.maxAchievableForwardVelocity),
      safeMotionLimit(constants.maxAchievableStrafeVelocity)
    );
    let targetVelocity = Math.min(
      directionalMaxVelocity,
      constants.maxVelocityConstraint !== null
        ? safeMotionLimit(constants.maxVelocityConstraint)
        : Number.POSITIVE_INFINITY
    );
    if (constants.maxAccelerationConstraint !== null) {
      targetVelocity = Math.min(
        targetVelocity,
        velocity + safeMotionLimit(constants.maxAccelerationConstraint) * step
      );
    }
    if (constants.maxDecelerationConstraint !== null) {
      const naturalDeceleration = getDirectionalNaturalDeceleration(
        projectedDirection.dx,
        projectedDirection.dy,
        heading,
        constants
      );
      const coastProjection = velocity * velocity / (2 * naturalDeceleration);
      const projectedRemaining = Math.max(0, totalDistance - distance - coastProjection);
      const coastTarget = Math.sqrt(
        constants.coastDownToVelocity * constants.coastDownToVelocity +
          2 * safeMotionLimit(constants.maxDecelerationConstraint) * projectedRemaining
      );
      targetVelocity = Math.min(targetVelocity, coastTarget);
    }

    const headingPriority = Math.abs(projectedHeadingError) > constants.headingDeviationTolerance;
    const headingPowerBeforeDrive = headingPriority
      ? headingPowers.feedforward + headingPowers.feedback
      : headingPowers.feedforward;
    const availableDrivePower = Math.max(0, 1 - Math.min(1, Math.abs(headingPowerBeforeDrive)));
    targetVelocity *= driveScale * availableDrivePower;

    const remainingDistance = Math.max(0, totalDistance - distance);
    const projectedRemainingDistance = remainingDistance - brakeDisplacement;
    const velocityToBrakeInTime = getPedroVelocityToBrakeInTime(
      projectedRemainingDistance,
      direction.dx,
      direction.dy,
      heading,
      constants
    );
    const isBraking = velocityToBrakeInTime <= 0 || projectedRemainingDistance <= 0;
    let deceleration = translationalAcceleration;
    if (isBraking && constants.brakeAtEnd) {
      targetVelocity = 0;
      const coefficientDeceleration = brakeDisplacement > 1e-6
        ? velocity * velocity / (2 * brakeDisplacement)
        : translationalAcceleration;
      // The tuned brake coefficients already describe the real robot's
      // stopping displacement. Scaling them again by controller power would
      // count the drivetrain response twice and greatly overestimate braking
      // time in an idealized visualizer plant.
      deceleration = safeMotionLimit(
        coefficientDeceleration / Math.max(1e-6, constants.brakeAggression)
      );
      peakBrakeAcceleration = Math.max(peakBrakeAcceleration, deceleration);
    } else if (targetVelocity < velocity) {
      deceleration = Math.min(
        translationalAcceleration,
        getDirectionalNaturalDeceleration(direction.dx, direction.dy, heading, constants),
        constants.maxDecelerationConstraint !== null
          ? safeMotionLimit(constants.maxDecelerationConstraint)
          : Number.POSITIVE_INFINITY
      );
    }

    const velocityDeltaLimit = (targetVelocity >= velocity ? translationalAcceleration : deceleration) * step;
    velocity += Math.max(-velocityDeltaLimit, Math.min(velocityDeltaLimit, targetVelocity - velocity));
    if (distance < totalDistance) {
      distance = Math.min(totalDistance, distance + velocity * step);
    } else {
      holdElapsed += step;
    }

    elapsed += step;
    frames.push({ time: elapsed, distance, heading, velocity });

    const finalHeading = samples[samples.length - 1]?.heading ?? heading;
    const headingComplete = Math.abs(normalizeHeading(finalHeading - heading)) <= constants.headingConstraint;
    const velocityComplete = !constants.brakeAtEnd || velocity <= constants.velocityConstraint;
    if (distance >= totalDistance && velocityComplete && (headingComplete || holdElapsed >= timeoutSeconds)) break;
  }

  return {
    frames,
    profile: createProfileSummary(
      frames,
      totalDistance,
      translationalAcceleration,
      peakBrakeAcceleration || translationalAcceleration
    ),
  };
};

export const buildPlaybackTimeline = (
  points: Point[],
  orderedSequenceItems: AutonSequenceItem[],
  robotConstants: RobotConstants,
  simulationParameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS
): PlaybackTimeline => {
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

    const positionSamples = samplePathSegmentsWithParameters(previousPoint, getPathSegments(point), 64);
    const headingMode = point.headingMode ?? "constant";
    const samples: ForesightSample[] = positionSamples.map((sample) => {
      const t = sample.pathT;
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
        const dx = sample.tangentX * FIELD_SIZE_INCHES;
        const dy = -sample.tangentY * FIELD_SIZE_INCHES;
        heading = normalizeHeading((Math.atan2(dx, dy) * 180) / Math.PI);
        if (point.tangentReversed) heading = normalizeHeading(heading + 180);
      }

      return { ...sample, nx: sample.x, ny: sample.y, heading };
    });
    const cumulativeDistances = [0];
    samples.slice(1).forEach((sample, index) => {
      cumulativeDistances.push(
        cumulativeDistances[cumulativeDistances.length - 1] + measureFieldDistance(samples[index], sample)
      );
    });
    const distance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

    if (distance > 0.001) {
      const simulation = simulateForesightPath(
        samples,
        cumulativeDistances,
        currentPose.heading,
        robotConstants,
        simulationParameters
      );
      const profile = simulation.profile;
      const simulationFrames = simulation.frames;
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
  const foundFrameEndIndex = findFirstIndexAtOrAfter(
    activeSegment.simulationFrames.length,
    (index) => activeSegment.simulationFrames[index].time,
    segmentTime
  );
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
