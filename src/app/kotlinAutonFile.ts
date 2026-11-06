import { FIELD_SIZE_INCHES, INITIAL_POINT_ID } from "./plannerConstants";
import type {
  AutonActionMode,
  AutonAlliance,
  AutonSequenceItem,
  HeadingInterpolation,
  PathActionTrigger,
  Point,
} from "./plannerTypes";
import { generateId, getPathSegments, normalizeHeading, resolvePathSegments, toFieldCoords, toNormalizedCoords } from "./plannerUtils";
import { seededColor } from "./plannerColors";

const formatKotlinNumber = (value: number) => value.toFixed(1);

/**
 * Positions along a path run 0 to 1, so a single decimal — fine for inches and
 * degrees — only leaves eleven places to put a trigger, and quietly rewrites a
 * team's own `.submitAt(0.35, ...)` as `0.4` on a round trip. The parser keeps
 * the full value, so the exporter has to as well or the simulation and the
 * generated code disagree about where an action fires.
 */
const formatKotlinPathT = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};
const DEFAULT_ROBOT_WIDTH = 16;
const DEFAULT_ROBOT_LENGTH = 16;
const POSE_MATCH_EPSILON = 0.05;
const START_POSE_PREFIX = "START_";
export const DEFAULT_AUTON_ALLIANCE: AutonAlliance = "BLUE";

export type ParsedKotlinAuton = {
  points: Point[];
  sequenceItems: AutonSequenceItem[];
  alliance: AutonAlliance;
};

export type SavedPose = {
  name: string;
  kotlinName?: string;
  x: number;
  y: number;
  heading: number;
  source?: string;
  start?: {
    horizontal: { value: number; offset: -1 | 0 | 1; reference?: string };
    vertical: { value: number; offset: -1 | 0 | 1; reference?: string };
    facing: "NORTH" | "EAST" | "SOUTH" | "WEST";
  };
};

export const savedPoseVariable = (pose: SavedPose) => pose.kotlinName ?? (pose.name.startsWith("START_") ? pose.name : `START_${pose.name}`);
export const findSavedPose = (poses: SavedPose[], name: string) => poses.find(pose => savedPoseVariable(pose) === name)
  ?? poses.find(pose => pose.name === name)
  ?? poses.find(pose => !pose.kotlinName && stripStartPosePrefix(pose.name) === stripStartPosePrefix(name));

export function resolveSavedPose(pose: SavedPose, dimensions: { width: number; length: number }): SavedPose {
  if (!pose.start) return pose;
  const sideways = pose.start.facing === "EAST" || pose.start.facing === "WEST";
  return { ...pose,
    x: pose.start.horizontal.value + pose.start.horizontal.offset * (sideways ? dimensions.length : dimensions.width) / 2,
    y: pose.start.vertical.value + pose.start.vertical.offset * (sideways ? dimensions.width : dimensions.length) / 2,
    heading: { NORTH: 0, EAST: 90, SOUTH: 180, WEST: -90 }[pose.start.facing],
  };
}

export function serializeSavedPosesKotlin(poses: SavedPose[]): string {
  const coordinate = (value: { value: number; offset: number; reference?: string }, axis: "Horizontal" | "Vertical") => {
    if (value.reference && /^(EAST|WEST|NORTH|SOUTH)_WALL$/.test(value.reference)) return value.reference;
    return `${axis}(${formatKotlinNumber(value.value)}, Offset.${value.offset < 0 ? "NEG" : value.offset > 0 ? "POS" : "NONE"})`;
  };
  return poses.map(pose => `val ${savedPoseVariable(pose)} = ${pose.source ?? (pose.start
    ? `startPose(${coordinate(pose.start.horizontal, "Horizontal")}, ${coordinate(pose.start.vertical, "Vertical")}, Heading.${pose.start.facing})`
    : `Pose(${formatKotlinNumber(pose.x)}, ${formatKotlinNumber(pose.y)}, ${formatKotlinNumber(pose.heading)})`)}`).join("\n");
}

export type RobotConstants = {
  width: number;
  length: number;
  maxAchievableForwardVelocity: number;
  maxAchievableStrafeVelocity: number;
  naturalForwardDeceleration: number;
  naturalStrafeDeceleration: number;
  linearBrakeForward: number;
  linearBrakeStrafe: number;
  quadraticBrakeForward: number;
  quadraticBrakeStrafe: number;
  maxAccelerationConstraint: number | null;
  maxVelocityConstraint: number | null;
  maxDecelerationConstraint: number | null;
  coastDownToVelocity: number;
  brakeAggression: number;
  maxBrakingPower: number;
  headingFeedback: number;
  headingStaticFeedforward: number;
  headingBrakeLinear: number;
  headingBrakeQuadratic: number;
  headingDriveRatio: number;
  headingDeviationTolerance: number;
  translationalDeviationTolerance: number;
  cosineScale: boolean;
  turnBeforeDriving: boolean;
  brakeAtEnd: boolean;
  parametricTConstraint: number;
  headingConstraint: number;
  translationalConstraint: number;
  velocityConstraint: number;
  timeoutConstraint: number;
};

type ParsedPoseReference = {
  nx: number;
  ny: number;
  heading?: number;
  poseName?: string;
};

export const stripStartPosePrefix = (name: string) =>
  name.startsWith(START_POSE_PREFIX) ? name.slice(START_POSE_PREFIX.length) : name;

// Stand-ins for a typical FTC drivetrain, used until the team imports their own
// tuned constants. Zeroes would be read as "no limit" by the motion profile and
// silently fall back to 1 in/s, which makes every playback estimate nonsense.
export const DEFAULT_ROBOT_CONSTANTS: RobotConstants = {
  width: DEFAULT_ROBOT_WIDTH,
  length: DEFAULT_ROBOT_LENGTH,
  maxAchievableForwardVelocity: 60,
  maxAchievableStrafeVelocity: 45,
  naturalForwardDeceleration: 35,
  naturalStrafeDeceleration: 70,
  linearBrakeForward: 0.10605894992901523,
  linearBrakeStrafe: 0.08719146175596092,
  quadraticBrakeForward: 0.0014663966976606565,
  quadraticBrakeStrafe: 0.0013837064502458813,
  maxAccelerationConstraint: null,
  maxVelocityConstraint: null,
  maxDecelerationConstraint: null,
  coastDownToVelocity: 0,
  brakeAggression: 1,
  maxBrakingPower: 0.2,
  headingFeedback: 5.258721785960744,
  headingStaticFeedforward: 0,
  headingBrakeLinear: 0.05642143125655298,
  headingBrakeQuadratic: 0.0063829525363003695,
  headingDriveRatio: 0.5,
  headingDeviationTolerance: 11.25,
  translationalDeviationTolerance: 2.5,
  cosineScale: false,
  turnBeforeDriving: false,
  brakeAtEnd: true,
  parametricTConstraint: 0.025,
  headingConstraint: 0.007 * (180 / Math.PI),
  translationalConstraint: 0.1,
  velocityConstraint: 0.1,
  timeoutConstraint: 100,
};

const findMatchingSavedPose = (point: { nx: number; ny: number; poseName?: string }, savedPoses: SavedPose[]) => {
  const coords = toFieldCoords(point.nx, point.ny);
  const pointPoseName = point.poseName?.trim();
  const poseNameMatch = pointPoseName
    ? savedPoses.find(
        (pose) =>
          pose === findSavedPose(savedPoses, pointPoseName) &&
          Math.abs(pose.x - coords.x) <= POSE_MATCH_EPSILON &&
          Math.abs(pose.y - coords.y) <= POSE_MATCH_EPSILON
      )
    : null;

  return poseNameMatch ?? savedPoses.find(
    (pose) =>
      Math.abs(pose.x - coords.x) <= POSE_MATCH_EPSILON &&
      Math.abs(pose.y - coords.y) <= POSE_MATCH_EPSILON
  );
};

const formatKotlinPose = (
  point: { nx: number; ny: number; poseName?: string },
  savedPoses: SavedPose[],
  heading?: number
) => {
  const savedPose = findMatchingSavedPose(point, savedPoses);
  if (savedPose && (heading === undefined || Math.abs(normalizeHeading(heading - (savedPose.heading ?? 0))) <= POSE_MATCH_EPSILON)) {
    return `Poses.${savedPoseVariable(savedPose)}`;
  }

  const coords = toFieldCoords(point.nx, point.ny);
  const headingArgument = heading !== undefined && normalizeHeading(heading) !== 0
    ? `, ${formatKotlinNumber(normalizeHeading(heading))}`
    : "";
  return `Pose(${formatKotlinNumber(coords.x)}, ${formatKotlinNumber(coords.y)}${headingArgument})`;
};

const stripLineComment = (line: string) => line.replace(/\/\/.*$/, "");

const evaluatePoseExpression = (expression: string, width = DEFAULT_ROBOT_WIDTH, length = DEFAULT_ROBOT_LENGTH) => {
  const constants: Record<string, number> = {
    "FieldCoordinateSystem.HALF_FIELD_SIZE": FIELD_SIZE_INCHES / 2,
    "HALF_FIELD_SIZE": FIELD_SIZE_INCHES / 2,
    "Robot.HALF_WIDTH": width / 2,
    "Robot.HALF_LENGTH": length / 2,
    "Constants.WIDTH": width,
    "Constants.LENGTH": length,
    "Constants.HEIGHT": length,
    "Constants.HALF_WIDTH": width / 2,
    "Constants.HALF_LENGTH": length / 2,
    "Constants.HALF_HEIGHT": length / 2,
  };
  const normalizedExpression = Object.entries(constants).reduce(
    (currentExpression, [constantName, value]) =>
      currentExpression.replaceAll(constantName, String(value)),
    expression.trim()
  );

  if (!/^[\d\s.+\-*/()]+$/.test(normalizedExpression)) return null;

  try {
    const value = Function(`"use strict"; return (${normalizedExpression});`)();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const parseChainedMethodValue = (contents: string, name: string) => {
  const numberPattern = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*(${numberPattern})[fFdD]?\\s*\\)`));
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const parseOptionalConstraint = (contents: string, name: string) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*([^)]+?)\\s*\\)`));
  if (!match) return null;
  if (/\b(?:ForesightConfig\s*\.\s*)?Constraint\s*\.\s*NONE\b/.test(match[1])) return null;

  const value = Number(match[1].trim().replace(/[fFdD]$/, ""));
  return Number.isFinite(value) ? value : null;
};

const parseConfiguredNumber = (contents: string, name: string, fallback: number) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*(Math\\.toRadians\\s*\\()?\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)[fFdD]?\\s*\\)?\\s*\\)`));
  if (!match) return fallback;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return fallback;
  return match[1] ? value : value;
};

const parseConfiguredAngle = (contents: string, name: string, fallbackDegrees: number) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*(Math\\.toRadians\\s*\\()?\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)[fFdD]?\\s*\\)?\\s*\\)`));
  if (!match) return fallbackDegrees;
  const value = Number(match[2]);
  return Number.isFinite(value) ? (match[1] ? value : value * (180 / Math.PI)) : fallbackDegrees;
};

const parseConfiguredBoolean = (contents: string, name: string, fallback: boolean) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*(true|false)\\s*\\)`, "i"));
  return match ? match[1].toLowerCase() === "true" : fallback;
};

const parseHeadingFeedback = (contents: string) => {
  const match = contents.match(/\.headingFeedback\s*\.\s*set\s*\(\s*Controller\.proportional\s*\(\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\)\s*\)/);
  return match ? Number(match[1]) : DEFAULT_ROBOT_CONSTANTS.headingFeedback;
};

const parseControllerGain = (
  contents: string,
  name: string,
  controller: "proportionalFeedforward" | "staticFeedforward",
  fallback: number
) => {
  const match = contents.match(new RegExp(
    `\\.${name}\\s*\\.\\s*set\\s*\\(\\s*Controller\\.${controller}\\s*\\(\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\s*\\)\\s*\\)`
  ));
  return match ? Number(match[1]) : fallback;
};

const parseHeadingBrakeCoefficients = (contents: string) => {
  const match = contents.match(/\.headingBrakeCoefficients\s*\.\s*set\s*\(\s*Vector2D\.cartesian\s*\(\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\)\s*\)/);
  return match
    ? { linear: Number(match[1]), quadratic: Number(match[2]) }
    : { linear: DEFAULT_ROBOT_CONSTANTS.headingBrakeLinear, quadratic: DEFAULT_ROBOT_CONSTANTS.headingBrakeQuadratic };
};

const parseBrakeMatrix = (contents: string, name: string, forwardFallback: number, strafeFallback: number) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\.\\s*set\\s*\\(\\s*Matrix\\.diag\\s*\\(\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\s*,\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\s*\\)\\s*\\)`));
  return match
    ? { forward: Number(match[1]), strafe: Number(match[2]) }
    : { forward: forwardFallback, strafe: strafeFallback };
};

export const parsePedroConstants = (
  contents: string,
  dimensions: Pick<RobotConstants, "width" | "length"> = DEFAULT_ROBOT_CONSTANTS
): RobotConstants | null => {
  const maxAchievableForwardVelocity = parseChainedMethodValue(contents, "maxAchievableForwardVelocity");
  const maxAchievableStrafeVelocity = parseChainedMethodValue(contents, "maxAchievableStrafeVelocity");
  const naturalForwardDeceleration = parseChainedMethodValue(contents, "naturalForwardDeceleration");
  const naturalStrafeDeceleration = parseChainedMethodValue(contents, "naturalStrafeDeceleration");
  const headingBrake = parseHeadingBrakeCoefficients(contents);
  const linearBrake = parseBrakeMatrix(contents, "linearBrakeCoefficients", DEFAULT_ROBOT_CONSTANTS.linearBrakeForward, DEFAULT_ROBOT_CONSTANTS.linearBrakeStrafe);
  const quadraticBrake = parseBrakeMatrix(contents, "quadraticBrakeCoefficients", DEFAULT_ROBOT_CONSTANTS.quadraticBrakeForward, DEFAULT_ROBOT_CONSTANTS.quadraticBrakeStrafe);

  if (
    maxAchievableForwardVelocity === null ||
    maxAchievableStrafeVelocity === null ||
    naturalForwardDeceleration === null ||
    naturalStrafeDeceleration === null
  ) {
    return null;
  }

  return {
    width: dimensions.width,
    length: dimensions.length,
    maxAchievableForwardVelocity,
    maxAchievableStrafeVelocity,
    naturalForwardDeceleration,
    naturalStrafeDeceleration,
    linearBrakeForward: linearBrake.forward,
    linearBrakeStrafe: linearBrake.strafe,
    quadraticBrakeForward: quadraticBrake.forward,
    quadraticBrakeStrafe: quadraticBrake.strafe,
    maxAccelerationConstraint: parseOptionalConstraint(contents, "maxAccelerationConstraint"),
    maxVelocityConstraint: parseOptionalConstraint(contents, "maxVelocityConstraint"),
    maxDecelerationConstraint: parseOptionalConstraint(contents, "maxDecelerationConstraint"),
    coastDownToVelocity: parseConfiguredNumber(contents, "coastDownToVelocity", DEFAULT_ROBOT_CONSTANTS.coastDownToVelocity),
    brakeAggression: parseConfiguredNumber(contents, "brakeAggression", DEFAULT_ROBOT_CONSTANTS.brakeAggression),
    maxBrakingPower: parseConfiguredNumber(contents, "maxBrakingPower", DEFAULT_ROBOT_CONSTANTS.maxBrakingPower),
    headingFeedback: parseHeadingFeedback(contents),
    headingStaticFeedforward: parseControllerGain(contents, "headingStaticFF", "staticFeedforward", DEFAULT_ROBOT_CONSTANTS.headingStaticFeedforward),
    headingBrakeLinear: headingBrake.linear,
    headingBrakeQuadratic: headingBrake.quadratic,
    headingDriveRatio: parseConfiguredNumber(contents, "headingDriveRatio", DEFAULT_ROBOT_CONSTANTS.headingDriveRatio),
    headingDeviationTolerance: parseConfiguredAngle(contents, "headingDeviationTolerance", DEFAULT_ROBOT_CONSTANTS.headingDeviationTolerance),
    translationalDeviationTolerance: parseConfiguredNumber(contents, "translationalDeviationTolerance", DEFAULT_ROBOT_CONSTANTS.translationalDeviationTolerance),
    cosineScale: parseConfiguredBoolean(contents, "cosineScale", DEFAULT_ROBOT_CONSTANTS.cosineScale),
    turnBeforeDriving: parseConfiguredBoolean(contents, "turnBeforeDriving", DEFAULT_ROBOT_CONSTANTS.turnBeforeDriving),
    brakeAtEnd: parseConfiguredBoolean(contents, "brakeAtEnd", DEFAULT_ROBOT_CONSTANTS.brakeAtEnd),
    parametricTConstraint: parseConfiguredNumber(contents, "parametricTConstraint", DEFAULT_ROBOT_CONSTANTS.parametricTConstraint),
    headingConstraint: parseConfiguredAngle(contents, "headingConstraint", DEFAULT_ROBOT_CONSTANTS.headingConstraint),
    translationalConstraint: parseConfiguredNumber(contents, "translationalConstraint", DEFAULT_ROBOT_CONSTANTS.translationalConstraint),
    velocityConstraint: parseConfiguredNumber(contents, "velocityConstraint", DEFAULT_ROBOT_CONSTANTS.velocityConstraint),
    timeoutConstraint: parseConfiguredNumber(contents, "timeoutConstraint", DEFAULT_ROBOT_CONSTANTS.timeoutConstraint),
  };
};

export const parseSavedPosesKotlin = (
  contents: string,
  dimensions: { width?: number; length?: number } = {}
): SavedPose[] => {
  const width = dimensions.width ?? DEFAULT_ROBOT_WIDTH;
  const length = dimensions.length ?? DEFAULT_ROBOT_LENGTH;
  const savedPoses: SavedPose[] = [];

  const mutationCall = String.raw`\.\s*(mirrorX|mirrorY|invert)\s*\(\s*\)`;
  const mutationSuffix = new RegExp(`^((?:\\s*${mutationCall})*)[ \\t]*(?=\\r?$|//|;|})`, "m");
  const applyMutations = (pose: SavedPose, suffix: string): SavedPose => {
    let result = pose;
    for (const mutation of suffix.matchAll(new RegExp(mutationCall, "g"))) {
      const flipX = mutation[1] !== "mirrorX";
      const flipY = mutation[1] !== "mirrorY";
      const heading = normalizeHeading(mutation[1] === "mirrorX" ? 180 - result.heading : mutation[1] === "mirrorY" ? -result.heading : result.heading + 180);
      const mirrorCoordinate = (coordinate: NonNullable<SavedPose["start"]>["horizontal"], flip: boolean) => {
        if (!flip) return coordinate;
        const oppositeWall: Record<string, string> = { EAST_WALL: "WEST_WALL", WEST_WALL: "EAST_WALL", NORTH_WALL: "SOUTH_WALL", SOUTH_WALL: "NORTH_WALL" };
        return { value: -coordinate.value, offset: -coordinate.offset as -1 | 0 | 1,
          ...(coordinate.reference && oppositeWall[coordinate.reference] ? { reference: oppositeWall[coordinate.reference] } : {}) };
      };
      result = { ...result, x: flipX ? -result.x : result.x, y: flipY ? -result.y : result.y, heading,
        ...(result.start ? { start: {
          horizontal: mirrorCoordinate(result.start.horizontal, flipX),
          vertical: mirrorCoordinate(result.start.vertical, flipY),
          facing: heading === 0 ? "NORTH" : heading === 90 ? "EAST" : heading === -90 ? "WEST" : "SOUTH",
        } } : {}) };
    }
    return result;
  };

  type FieldCoordinate = { value: number; offset: -1 | 0 | 1; reference?: string };
  const halfFieldSize = FIELD_SIZE_INCHES / 2;
  const horizontalCoordinates = new Map<string, FieldCoordinate>([
    ["EAST_WALL", { value: halfFieldSize, offset: -1 }],
    ["WEST_WALL", { value: -halfFieldSize, offset: 1 }],
  ]);
  const verticalCoordinates = new Map<string, FieldCoordinate>([
    ["NORTH_WALL", { value: halfFieldSize, offset: -1 }],
    ["SOUTH_WALL", { value: -halfFieldSize, offset: 1 }],
  ]);

  const parseOffset = (expression: string): -1 | 0 | 1 | null => {
    const match = expression.trim().match(/(?:Offset\s*\.\s*)?(NEG|NONE|POS)\b/);
    if (!match) return null;
    return match[1] === "NEG" ? -1 : match[1] === "POS" ? 1 : 0;
  };

  const parseCoordinate = (expression: string, axis: "Horizontal" | "Vertical"): FieldCoordinate | null => {
    const trimmedExpression = stripLineComment(expression).trim();
    const referenceMatch = trimmedExpression.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
    if (referenceMatch) {
      const coordinate = (axis === "Horizontal" ? horizontalCoordinates : verticalCoordinates).get(referenceMatch[1]);
      return coordinate ? { ...coordinate, reference: referenceMatch[1] } : null;
    }

    const constructorMatch = trimmedExpression.match(new RegExp(`^(?:[A-Za-z_][A-Za-z0-9_]*\\.)*${axis}\\s*\\(`));
    if (!constructorMatch) return null;
    const openParenIndex = trimmedExpression.indexOf("(", constructorMatch.index);
    const closeParenIndex = findMatchingParen(trimmedExpression, openParenIndex);
    if (closeParenIndex < 0) return null;

    const args = splitTopLevelArgs(trimmedExpression.slice(openParenIndex + 1, closeParenIndex));
    const value = evaluatePoseExpression(args[0] ?? "", width, length);
    const offset = parseOffset(args[1] ?? "");
    return value === null || offset === null ? null : { value, offset };
  };

  const coordinateRegex = /\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(Horizontal|Vertical)\s*\(/g;
  let coordinateMatch: RegExpExecArray | null;
  while ((coordinateMatch = coordinateRegex.exec(contents)) !== null) {
    const openParenIndex = contents.indexOf("(", coordinateMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const coordinate = parseCoordinate(
      `${coordinateMatch[2]}(${contents.slice(openParenIndex + 1, closeParenIndex)})`,
      coordinateMatch[2] as "Horizontal" | "Vertical"
    );
    if (coordinate) {
      (coordinateMatch[2] === "Horizontal" ? horizontalCoordinates : verticalCoordinates).set(coordinateMatch[1], coordinate);
    }
    coordinateRegex.lastIndex = closeParenIndex + 1;
  }

  const startPoseRegex = /\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*Pose\s*)?=\s*startPose\s*\(/g;
  let poseMatch: RegExpExecArray | null;
  while ((poseMatch = startPoseRegex.exec(contents)) !== null) {
    const name = stripStartPosePrefix(poseMatch[1]);

    const openParenIndex = contents.indexOf("(", poseMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const args = splitTopLevelArgs(contents.slice(openParenIndex + 1, closeParenIndex)).map(stripLineComment);
    const suffix = contents.slice(closeParenIndex + 1).match(mutationSuffix);
    if (!suffix) continue;
    const horizontal = parseCoordinate(args[0] ?? "", "Horizontal");
    const vertical = parseCoordinate(args[1] ?? "", "Vertical");
    const headingMatch = (args[2] ?? "").match(/(?:Heading\s*\.\s*)?(NORTH|EAST|SOUTH|WEST)\b/);
    if (!horizontal || !vertical || !headingMatch) continue;

    const headings = { NORTH: 0, EAST: 90, SOUTH: 180, WEST: -90 } as const;
    const heading = headings[headingMatch[1] as keyof typeof headings];
    const sideways = heading === 90 || heading === -90;
    const reachX = sideways ? length / 2 : width / 2;
    const reachY = sideways ? width / 2 : length / 2;

    savedPoses.push(applyMutations({
      name,
      ...(poseMatch[1].startsWith(START_POSE_PREFIX) ? {} : { kotlinName: poseMatch[1] }),
      x: horizontal.value + horizontal.offset * reachX,
      y: vertical.value + vertical.offset * reachY,
      heading,
      start: { horizontal, vertical, facing: headingMatch[1] as NonNullable<SavedPose["start"]>["facing"] },
      ...(suffix[1].trim() ? { source: `startPose(${contents.slice(openParenIndex + 1, closeParenIndex)})${suffix[1]}` } : {}),
    }, suffix[1]));
    startPoseRegex.lastIndex = closeParenIndex + 1;
  }

  const directPoseRegex = /\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*Pose\s*)?=\s*Pose\s*\(/g;
  let direct: RegExpExecArray | null;
  while ((direct = directPoseRegex.exec(contents)) !== null) {
    const open = contents.indexOf("(", direct.index);
    const close = findMatchingParen(contents, open);
    if (close < 0) continue;
    const args = splitTopLevelArgs(contents.slice(open + 1, close)).map(stripLineComment);
    const x = evaluatePoseExpression(args[0] ?? "", width, length);
    const y = evaluatePoseExpression(args[1] ?? "", width, length);
    const heading = evaluatePoseExpression(args[2] ?? "0", width, length);
    const suffix = contents.slice(close + 1).match(mutationSuffix);
    if (x !== null && y !== null && heading !== null && suffix) savedPoses.push(applyMutations({ name: direct[1], kotlinName: direct[1], x, y, heading,
      source: `Pose(${contents.slice(open + 1, close)})${suffix[1]}` }, suffix[1]));
    directPoseRegex.lastIndex = close + 1;
  }
  const aliases = [...contents.matchAll(new RegExp(String.raw`\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*Pose\s*)?=\s*((?:Poses\s*\.\s*)?([A-Za-z_][A-Za-z0-9_]*)((?:\s*${mutationCall})*))[ \t]*(?=\r?$|//|;|})`, "gm"))];
  for (let pass = 0; pass < aliases.length; pass++) {
    let added = false;
    for (const alias of aliases) {
      if (savedPoses.some(pose => savedPoseVariable(pose) === alias[1])) continue;
      const base = savedPoses.find(pose => savedPoseVariable(pose) === alias[3]);
      if (!base) continue;
      savedPoses.push(applyMutations({ ...base, name: alias[1], kotlinName: alias[1], source: alias[2] }, alias[4]));
      added = true;
    }
    if (!added) break;
  }
  return savedPoses;
};

const toKotlinVariableName = (name: string, fallback: string) => {
  const trimmedName = name.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedName)) return trimmedName;

  const words = trimmedName.match(/[A-Za-z0-9]+/g) ?? [];
  const camelName = words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      if (index === 0) return normalized;
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
  const variableName = camelName || fallback;
  return /^[A-Za-z_]/.test(variableName) ? variableName : `${fallback}${variableName}`;
};

const createUniquePathNames = (points: Point[]) => {
  const usedNames = new Set<string>();
  return points.slice(1).map((point, pathIndex) => {
    const baseName = toKotlinVariableName(point.name?.trim() || "", `path${pathIndex + 1}`);
    let name = baseName;
    let suffix = 2;

    while (usedNames.has(name)) {
      name = `${baseName}${suffix}`;
      suffix++;
    }

    usedNames.add(name);
    return name;
  });
};

const createPathNameByPointId = (points: Point[]) => {
  const pathNames = createUniquePathNames(points);
  return new Map(points.slice(1).map((point, index) => [point.id, pathNames[index]]));
};

const formatActionCall = (item: AutonSequenceItem) => {
  if (item.kind !== "action") return "";
  const actionName = item.name.trim() || "INTAKE";
  if (item.mode === "run") return `    .run(Actions.${actionName}, ${formatKotlinNumber(item.timeout)})`;
  return `    .${item.mode}(Actions.${actionName})`;
};

const formatPathActionTrigger = (trigger: PathActionTrigger) => {
  const actionName = trigger.actionName.trim() || "ACTION";
  return `\n            .${trigger.mode}At(${formatKotlinPathT(trigger.t)}, Actions.${actionName})`;
};

const formatPathCall = (pathName: string, point?: Point) => {
  const triggers = [...(point?.actionTriggers ?? [])].sort((a, b) => a.t - b.t);
  if (triggers.length === 0) return `    .path(${pathName})`;

  return `    .path(
        ${pathName}${triggers.map(formatPathActionTrigger).join("")}
    )`;
};

const parseAutonAlliance = (contents: string): AutonAlliance => {
  const autonSequenceMatch = contents.match(/\bautonSequence\s*\(\s*Alliance\.(BLUE|RED)\s*\)/);
  const createForMatch = contents.match(/\.createFor\s*\(\s*Alliance\.(BLUE|RED)\s*\)/);
  const constructorMatch = contents.match(/:\s*Auto\s*\(\s*Alliance\.(BLUE|RED)\s*\)/);
  return (autonSequenceMatch?.[1] ?? createForMatch?.[1] ?? constructorMatch?.[1] ?? DEFAULT_AUTON_ALLIANCE) as AutonAlliance;
};

export const serializePathPlannerKotlin = (
  points: Point[],
  savedPoses: SavedPose[] = [],
  sequenceItems: AutonSequenceItem[] = [],
  options: { alliance?: AutonAlliance } = {}
) => {
  const alliance = options.alliance ?? DEFAULT_AUTON_ALLIANCE;
  const pathPoints = points.slice(1);
  const pathNameByPointId = createPathNameByPointId(points);
  const pointById = new Map(points.map((point) => [point.id, point]));
  const pathNames = pathPoints.map((point, pathIndex) => pathNameByPointId.get(point.id) ?? `path${pathIndex + 1}`);
  const pathDeclarations = pathPoints
    .map((point, pathIndex) => {
      const previousPoint = points[pathIndex];
      const pathName = pathNames[pathIndex];
      const segments = getPathSegments(point);
      const resolvedSegments = resolvePathSegments(previousPoint, segments);
      const segmentDeclarations = resolvedSegments.map((resolved, segmentIndex) => {
        const segmentStart = segmentIndex === 0 ? previousPoint : segments[segmentIndex - 1];
        const startPose = formatKotlinPose(
          segmentStart,
          savedPoses,
          pathIndex === 0 && segmentIndex === 0 ? previousPoint.heading ?? 0 : undefined
        );
        const endPose = formatKotlinPose(segments[segmentIndex], savedPoses);
        if (!resolved.control1 || !resolved.control2) {
          return `    Linear(\n        ${startPose},\n        ${endPose},\n    ),`;
        }
        const control1 = formatKotlinPose({ nx: resolved.control1.x, ny: resolved.control1.y }, []);
        const control2 = formatKotlinPose({ nx: resolved.control2.x, ny: resolved.control2.y }, []);
        return `    Spline(\n        ${startPose},\n        ${control1},\n        ${control2},\n        ${endPose},\n    ),`;
      });
      const headingMode = point.headingMode ?? "constant";
      const linearStartT = point.linearStartT ?? 0;
      const linearEndT = point.linearEndT ?? 1;
      const shouldExportLinearT = Math.abs(linearStartT) > 0.0001 || Math.abs(linearEndT - 1) > 0.0001;
      const headingCall =
        headingMode === "linear"
          ? `linearHeading(${formatKotlinNumber(point.startHeading ?? 0)}, ${formatKotlinNumber(point.endHeading ?? 0)}${shouldExportLinearT ? `, ${formatKotlinPathT(linearStartT)}, ${formatKotlinPathT(linearEndT)}` : ""})`
          : headingMode === "tangential"
            ? point.tangentReversed
              ? "reversedTangentHeading()"
              : "tangentHeading()"
            : `constantHeading(${formatKotlinNumber(point.constantHeading ?? 0)})`;

      return `val ${pathName} = Path(
${segmentDeclarations.join("\n")}
).${headingCall}`;
    })
    .join("\n\n");

  const builderItems = sequenceItems.length > 0
    ? sequenceItems
    : pathPoints.map((point) => ({ id: `path-item-${point.id}`, kind: "path" as const, pointId: point.id }));
  const builderCalls = builderItems
    .map((item) => {
      if (item.kind === "action") return formatActionCall(item);
      const pathName = pathNameByPointId.get(item.pointId);
      return pathName ? formatPathCall(pathName, pointById.get(item.pointId)) : "";
    })
    .filter(Boolean)
    .join("\n");

  return `${pathDeclarations || "// Add paths in the editor before exporting."}

autonSequence(Alliance.${alliance})${builderCalls ? `\n${builderCalls}` : ""}`;
};

const findMatchingParen = (contents: string, openParenIndex: number) => {
  let depth = 0;
  for (let i = openParenIndex; i < contents.length; i++) {
    const char = contents[i];
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth === 0) return i;
  }
  return -1;
};

const splitTopLevelArgs = (contents: string) => {
  const args: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < contents.length; i++) {
    const char = contents[i];
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      const arg = contents.slice(start, i).trim();
      if (arg) args.push(arg);
      start = i + 1;
    }
  }

  const finalArg = contents.slice(start).trim();
  if (finalArg) args.push(finalArg);
  return args;
};

const parseKotlinPose = (arg: string, savedPoses: SavedPose[]): ParsedPoseReference | null => {
  const poseReferenceMatch = arg.match(/\bPoses\.([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (poseReferenceMatch) {
    const savedPose = findSavedPose(savedPoses, poseReferenceMatch[1]);
    if (savedPose) {
      const normalizedCoords = toNormalizedCoords(savedPose.x, savedPose.y);
      return {
        ...normalizedCoords,
        heading: savedPose.heading ?? 0,
        poseName: savedPoseVariable(savedPose),
      };
    }
  }

  const match = arg.match(/Pose\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const headingMatch = arg.match(/Pose\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*(-?\d+(?:\.\d+)?)/);
  return {
    ...toNormalizedCoords(Number(match[1]), Number(match[2])),
    heading: normalizeHeading(headingMatch ? Number(headingMatch[1]) : 0),
  };
};

export const parsePathPlannerKotlin = (contents: string, savedPoses: SavedPose[] = []): ParsedKotlinAuton | null => {
  type ParsedBuilderCall =
    | { kind: "path"; pathName: string; triggers: PathActionTrigger[] }
    | {
        kind: "action";
        id: string;
        name: string;
        mode: AutonActionMode;
        timeout: number;
      };
  type ParsedPath = {
    name: string;
    curves: Array<{
      pathGeometry: "linear" | "spline";
      poses: ParsedPoseReference[];
    }>;
    headingMode: HeadingInterpolation;
    constantHeading: number;
    startHeading: number;
    endHeading: number;
    linearStartT: number;
    linearEndT: number;
    tangentReversed: boolean;
  };

  const pathDefinitions = new Map<string, ParsedPath>();
  const pathRegex = /val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Path\s*\(/g;
  let pathMatch: RegExpExecArray | null;

  while ((pathMatch = pathRegex.exec(contents)) !== null) {
    const name = pathMatch[1];
    const openParenIndex = contents.indexOf("(", pathMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const args = splitTopLevelArgs(contents.slice(openParenIndex + 1, closeParenIndex));
    const curves = args.flatMap((arg) => {
      const curveMatch = arg.match(/^\s*(Linear|Spline)\s*\(/);
      if (!curveMatch) return [];
      const curveOpenParenIndex = arg.indexOf("(", curveMatch.index ?? 0);
      const curveCloseParenIndex = findMatchingParen(arg, curveOpenParenIndex);
      if (curveCloseParenIndex < 0) return [];
      const poses = splitTopLevelArgs(arg.slice(curveOpenParenIndex + 1, curveCloseParenIndex))
        .map((poseArg) => parseKotlinPose(poseArg, savedPoses));
      const expectedPoseCount = curveMatch[1] === "Linear" ? 2 : 4;
      if (poses.length !== expectedPoseCount || poses.some((pose) => pose === null)) return [];
      return [{
        pathGeometry: curveMatch[1] === "Linear" ? "linear" as const : "spline" as const,
        poses: poses as ParsedPoseReference[],
      }];
    });
    if (curves.length === 0 || curves.length !== args.length) {
      pathRegex.lastIndex = closeParenIndex + 1;
      continue;
    }
    const afterPath = contents.slice(closeParenIndex + 1, closeParenIndex + 160);
    const headingMatch = afterPath.match(
      /^\s*\.\s*(constantHeading|linearHeading|tangentHeading|reversedTangentHeading)\s*\(([^)]*)\)/
    );

    let headingMode: HeadingInterpolation = "constant";
    let constantHeading = 0;
    let startHeading = 0;
    let endHeading = 0;
    let linearStartT = 0;
    let linearEndT = 1;
    let tangentReversed = false;

    if (headingMatch?.[1] === "linearHeading") {
      headingMode = "linear";
      const values = headingMatch[2]
        .split(",")
        .map((value) => parseFloat(value.trim()))
        .filter((value) => !Number.isNaN(value));
      startHeading = normalizeHeading(values[0] ?? 0);
      endHeading = normalizeHeading(values[1] ?? 0);
      linearStartT = Math.max(0, Math.min(1, values[2] ?? 0));
      linearEndT = Math.max(0, Math.min(1, values[3] ?? 1));
    } else if (headingMatch?.[1] === "tangentHeading" || headingMatch?.[1] === "reversedTangentHeading") {
      headingMode = "tangential";
      tangentReversed = headingMatch[1] === "reversedTangentHeading";
    } else if (headingMatch?.[1] === "constantHeading") {
      const value = parseFloat(headingMatch[2].trim());
      constantHeading = normalizeHeading(Number.isNaN(value) ? 0 : value);
    }

    pathDefinitions.set(name, { name, curves, headingMode, constantHeading, startHeading, endHeading, linearStartT, linearEndT, tangentReversed });
    pathRegex.lastIndex = closeParenIndex + 1;
  }

  const builderCalls: ParsedBuilderCall[] = [];
  const builderCallRegex = /\.(path|submit|remove|run)\s*\(/g;
  let builderCallMatch: RegExpExecArray | null;

  while ((builderCallMatch = builderCallRegex.exec(contents)) !== null) {
    const method = builderCallMatch[1];
    const openParenIndex = contents.indexOf("(", builderCallMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const callContents = contents.slice(openParenIndex + 1, closeParenIndex);
    const args = splitTopLevelArgs(callContents);
    if (method === "path") {
      const pathName = callContents.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
      if (pathName) {
        const triggers: PathActionTrigger[] = [...callContents.matchAll(/\.(submitAt|removeAt)\s*\(([^)]*)\)/g)]
          .map((triggerMatch) => {
            const triggerArgs = splitTopLevelArgs(triggerMatch[2]);
            const t = Number.parseFloat(triggerArgs[0] ?? "0");
            const actionName = triggerArgs[1]?.match(/\bActions\.([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1] ?? "ACTION";
            return {
              id: generateId(),
              mode: triggerMatch[1] === "submitAt" ? "submit" as const : "remove" as const,
              t: Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0,
              actionName,
            };
          });
        builderCalls.push({ kind: "path", pathName, triggers });
      }
      builderCallRegex.lastIndex = closeParenIndex + 1;
      continue;
    }

    const actionName = args[0]?.match(/\bActions\.([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
    if (!actionName) {
      builderCallRegex.lastIndex = closeParenIndex + 1;
      continue;
    }

    const mode = method as AutonActionMode;
    const timeout = mode === "run" ? Number.parseFloat(args[1] ?? "0") : 0;
    builderCalls.push({
      kind: "action" as const,
      id: generateId(),
      name: actionName,
      mode,
      timeout: Number.isFinite(timeout) ? timeout : 0,
    });
    builderCallRegex.lastIndex = closeParenIndex + 1;
  }
  // One entry per path call rather than per path name. A cycling auton
  // follows the same declared path several times, and keying any of this by name
  // collapses those calls onto whichever point was built last, so the sequence
  // ends up driving a path the robot is not standing at the start of.
  type FollowedPath = { path: ParsedPath; triggers: PathActionTrigger[] };
  const followedPaths = builderCalls
    .filter((call): call is { kind: "path"; pathName: string; triggers: PathActionTrigger[] } => call.kind === "path")
    .map((call) => ({ path: pathDefinitions.get(call.pathName), triggers: call.triggers }))
    .filter((followed): followed is FollowedPath => Boolean(followed.path));
  const orderedPaths: FollowedPath[] =
    followedPaths.length > 0
      ? followedPaths
      : [...pathDefinitions.values()].map((path) => ({ path, triggers: [] as PathActionTrigger[] }));

  if (orderedPaths.length === 0) return null;

  const firstStart = orderedPaths[0].path.curves[0]?.poses[0];
  const importedPoints: Point[] = [
    {
      id: INITIAL_POINT_ID,
      nx: firstStart?.nx ?? 0.5,
      ny: firstStart?.ny ?? 0.5,
      color: seededColor(INITIAL_POINT_ID),
      locked: true,
      heading: firstStart?.heading ?? 0,
      poseName: firstStart?.poseName,
    },
  ];

  // Indexed by follow position so it stays aligned with orderedPaths, including
  // the entries below that produce no point at all.
  const pathPointIdsByFollowIndex: Array<string | null> = [];
  orderedPaths.forEach(({ path, triggers }) => {
    const importedSegments = path.curves.map((curve) => {
      const startPose = curve.poses[0];
      const endPose = curve.poses.at(-1)!;
      return {
        id: generateId(),
        nx: endPose.nx,
        ny: endPose.ny,
        poseName: endPose.poseName,
        pathGeometry: curve.pathGeometry,
        ...(curve.pathGeometry === "spline"
          ? {
              startControlOffsetNx: curve.poses[1].nx - startPose.nx,
              startControlOffsetNy: curve.poses[1].ny - startPose.ny,
              endControlOffsetNx: endPose.nx - curve.poses[2].nx,
              endControlOffsetNy: endPose.ny - curve.poses[2].ny,
            }
          : {}),
      };
    });
    const endPose = path.curves.at(-1)?.poses.at(-1);
    if (!endPose) {
      pathPointIdsByFollowIndex.push(null);
      return;
    }
    const finalSegment = importedSegments.at(-1)!;

    const pointId = generateId();
    pathPointIdsByFollowIndex.push(pointId);
    importedPoints.push({
      id: pointId,
      name: path.name,
      nx: endPose.nx,
      ny: endPose.ny,
      poseName: endPose.poseName,
      color: seededColor(`path:${path.name}`),
      locked: false,
      headingMode: path.headingMode,
      constantHeading: path.constantHeading,
      startHeading: path.startHeading,
      endHeading: path.endHeading,
      linearStartT: path.linearStartT,
      linearEndT: path.linearEndT,
      tangentReversed: path.tangentReversed,
      pathGeometry: finalSegment.pathGeometry,
      segmentId: finalSegment.id,
      startControlOffsetNx: finalSegment.startControlOffsetNx,
      startControlOffsetNy: finalSegment.startControlOffsetNy,
      endControlOffsetNx: finalSegment.endControlOffsetNx,
      endControlOffsetNy: finalSegment.endControlOffsetNy,
      controlPoints: importedSegments.slice(0, -1),
      controlsExpanded: true,
      actionsExpanded: triggers.length > 0,
      actionTriggers: [...triggers].sort((a, b) => a.t - b.t),
    });
  });

  // Walks the follow calls in step with the points built above. A call naming a
  // path that was never declared built no point, so it consumes no position.
  let followIndex = 0;
  const sequenceItems = builderCalls.length > 0
    ? builderCalls
        .map((call): AutonSequenceItem | null => {
          if (call.kind === "action") return call;
          if (!pathDefinitions.has(call.pathName)) return null;
          const pointId = pathPointIdsByFollowIndex[followIndex] ?? null;
          followIndex += 1;
          return pointId ? { id: generateId(), kind: "path", pointId } : null;
        })
        .filter((item): item is AutonSequenceItem => item !== null)
    : importedPoints.slice(1).map((point) => ({ id: generateId(), kind: "path" as const, pointId: point.id }));

  return importedPoints.length > 1
    ? {
        points: importedPoints,
        sequenceItems,
        alliance: parseAutonAlliance(contents),
      }
    : null;
};
