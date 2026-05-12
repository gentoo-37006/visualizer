import {
  DEFAULT_ROBOT_CONSTANTS,
  stripStartPosePrefix,
  type RobotConstants,
  type SavedPose,
} from "./kotlinAutonFile";
import type { MotionParameters } from "./plannerTypes";

export const SAVED_POSES_STORAGE_KEY = "auton-path-planner:saved-poses";
export const ROBOT_CONSTANTS_STORAGE_KEY = "auton-path-planner:robot-constants";
export const MOTION_PARAMETERS_STORAGE_KEY = "auton-path-planner:motion-parameters";

export const DEFAULT_MOTION_PARAMETERS: MotionParameters = {
  maxAngularVelocity: 180,
  maxForwardAcceleration: 60,
  maxLateralAcceleration: 60,
};

const isSavedPoseArray = (value: unknown): value is SavedPose[] =>
  Array.isArray(value) &&
  value.every(
    (pose) =>
      typeof pose?.name === "string" &&
      typeof pose?.x === "number" &&
      typeof pose?.y === "number" &&
      (typeof pose?.heading === "number" || pose?.heading === undefined)
  );

export const loadSavedPoses = () => {
  if (typeof window === "undefined") return [];

  const storedSavedPoses = window.localStorage.getItem(SAVED_POSES_STORAGE_KEY);
  if (!storedSavedPoses) return [];

  try {
    const parsedSavedPoses: unknown = JSON.parse(storedSavedPoses);
    return isSavedPoseArray(parsedSavedPoses)
      ? parsedSavedPoses.map((pose) => ({
          ...pose,
          heading: pose.heading ?? 0,
          name: stripStartPosePrefix(pose.name),
        }))
      : [];
  } catch {
    window.localStorage.removeItem(SAVED_POSES_STORAGE_KEY);
    return [];
  }
};

const isRobotConstants = (value: unknown): value is RobotConstants =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RobotConstants).width === "number" &&
  typeof (value as RobotConstants).length === "number" &&
  typeof (value as RobotConstants).forwardBrakeStrength === "number" &&
  typeof (value as RobotConstants).lateralBrakeStrength === "number" &&
  typeof (value as RobotConstants).maxForwardVelocity === "number" &&
  typeof (value as RobotConstants).maxLateralVelocity === "number";

export const loadRobotConstants = () => {
  if (typeof window === "undefined") return DEFAULT_ROBOT_CONSTANTS;

  const storedRobotConstants = window.localStorage.getItem(ROBOT_CONSTANTS_STORAGE_KEY);
  if (!storedRobotConstants) return DEFAULT_ROBOT_CONSTANTS;

  try {
    const parsedRobotConstants: unknown = JSON.parse(storedRobotConstants);
    return isRobotConstants(parsedRobotConstants)
      ? { ...DEFAULT_ROBOT_CONSTANTS, ...parsedRobotConstants }
      : DEFAULT_ROBOT_CONSTANTS;
  } catch {
    window.localStorage.removeItem(ROBOT_CONSTANTS_STORAGE_KEY);
    return DEFAULT_ROBOT_CONSTANTS;
  }
};

const isMotionParameters = (value: unknown): value is MotionParameters =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as MotionParameters).maxAngularVelocity === "number";

export const loadMotionParameters = () => {
  if (typeof window === "undefined") return DEFAULT_MOTION_PARAMETERS;

  const storedMotionParameters = window.localStorage.getItem(MOTION_PARAMETERS_STORAGE_KEY);
  if (!storedMotionParameters) return DEFAULT_MOTION_PARAMETERS;

  try {
    const parsedMotionParameters: unknown = JSON.parse(storedMotionParameters);
    return isMotionParameters(parsedMotionParameters)
      ? { ...DEFAULT_MOTION_PARAMETERS, ...parsedMotionParameters }
      : DEFAULT_MOTION_PARAMETERS;
  } catch {
    window.localStorage.removeItem(MOTION_PARAMETERS_STORAGE_KEY);
    return DEFAULT_MOTION_PARAMETERS;
  }
};
