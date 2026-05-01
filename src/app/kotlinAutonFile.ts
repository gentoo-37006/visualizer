import { INITIAL_POINT_ID } from "./plannerConstants";
import type { HeadingInterpolation, Point } from "./plannerTypes";
import {
  generateId,
  isKotlinIdentifierDraft,
  normalizeHeading,
  randomColor,
  toFieldCoords,
  toNormalizedCoords,
} from "./plannerUtils";

const formatKotlinNumber = (value: number) => value.toFixed(1);
const DEFAULT_AUTON_CLASS_NAME = "AutonPath";
const DEFAULT_ROBOT_WIDTH = 16;
const DEFAULT_ROBOT_LENGTH = 16;
const POSE_MATCH_EPSILON = 0.05;

export type ParsedKotlinAuton = {
  className: string;
  points: Point[];
};

export type SavedPose = {
  name: string;
  x: number;
  y: number;
};

export type RobotConstants = {
  width: number;
  length: number;
  forwardBrakeStrength: number;
  lateralBrakeStrength: number;
  maxForwardVelocity: number;
  maxLateralVelocity: number;
};

type ParsedPoseReference = {
  nx: number;
  ny: number;
  poseName?: string;
};

export const DEFAULT_ROBOT_CONSTANTS: RobotConstants = {
  width: DEFAULT_ROBOT_WIDTH,
  length: DEFAULT_ROBOT_LENGTH,
  forwardBrakeStrength: 0,
  lateralBrakeStrength: 0,
  maxForwardVelocity: 0,
  maxLateralVelocity: 0,
};

const findMatchingSavedPose = (point: { nx: number; ny: number; poseName?: string }, savedPoses: SavedPose[]) => {
  const coords = toFieldCoords(point.nx, point.ny);
  const pointPoseName = point.poseName?.trim();
  const poseNameMatch = pointPoseName
    ? savedPoses.find(
        (pose) =>
          pose.name === pointPoseName &&
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

const formatKotlinPose = (point: { nx: number; ny: number; poseName?: string }, savedPoses: SavedPose[]) => {
  const savedPose = findMatchingSavedPose(point, savedPoses);
  if (savedPose) return `Poses.${savedPose.name}`;

  const coords = toFieldCoords(point.nx, point.ny);
  return `Pose(${formatKotlinNumber(coords.x)}, ${formatKotlinNumber(coords.y)})`;
};

const stripLineComment = (line: string) => line.replace(/\/\/.*$/, "");

const evaluatePoseExpression = (expression: string, width = DEFAULT_ROBOT_WIDTH, length = DEFAULT_ROBOT_LENGTH) => {
  const constants: Record<string, number> = {
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

const parseConstantValue = (contents: string, name: string) => {
  const match = contents.match(new RegExp(`\\bconst\\s+val\\s+${name}\\s*:\\s*(?:Double|Int)\\s*=\\s*([^\\n]+)`));
  if (!match) return null;

  return evaluatePoseExpression(stripLineComment(match[1]));
};

const parseChainedMethodValue = (contents: string, name: string) => {
  const match = contents.match(new RegExp(`\\.${name}\\s*\\(\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*\\)`));
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

export const parseRobotConstantsKotlin = (contents: string): RobotConstants | null => {
  const width = parseConstantValue(contents, "WIDTH");
  const length = parseConstantValue(contents, "LENGTH");
  const forwardBrakeStrength = parseChainedMethodValue(contents, "forwardZeroPowerAcceleration");
  const lateralBrakeStrength = parseChainedMethodValue(contents, "lateralZeroPowerAcceleration");
  const maxForwardVelocity = parseChainedMethodValue(contents, "xVelocity");
  const maxLateralVelocity = parseChainedMethodValue(contents, "yVelocity");

  if (
    width === null ||
    length === null ||
    forwardBrakeStrength === null ||
    lateralBrakeStrength === null ||
    maxForwardVelocity === null ||
    maxLateralVelocity === null
  ) {
    return null;
  }

  return {
    width,
    length,
    forwardBrakeStrength,
    lateralBrakeStrength,
    maxForwardVelocity,
    maxLateralVelocity,
  };
};

export const parseSavedPosesKotlin = (
  contents: string,
  dimensions: { width?: number; length?: number } = {}
): SavedPose[] => {
  const width = dimensions.width ?? DEFAULT_ROBOT_WIDTH;
  const length = dimensions.length ?? DEFAULT_ROBOT_LENGTH;
  const savedPoses: SavedPose[] = [];
  const usedNames = new Set<string>();
  const poseRegex = /\bval\s+(START[A-Za-z0-9_]*)\s*=\s*Pose\s*\(/g;
  let poseMatch: RegExpExecArray | null;

  while ((poseMatch = poseRegex.exec(contents)) !== null) {
    const name = poseMatch[1];
    if (usedNames.has(name)) continue;

    const openParenIndex = contents.indexOf("(", poseMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const args = splitTopLevelArgs(contents.slice(openParenIndex + 1, closeParenIndex)).map(stripLineComment);
    const x = evaluatePoseExpression(args[0] ?? "", width, length);
    const y = evaluatePoseExpression(args[1] ?? "", width, length);
    if (x === null || y === null) continue;

    usedNames.add(name);
    savedPoses.push({ name, x, y });
    poseRegex.lastIndex = closeParenIndex + 1;
  }

  return savedPoses;
};

const formatStartPoseCoordinate = (
  value: number,
  constantName: "HALF_WIDTH" | "HALF_LENGTH",
  dimensions: { width?: number; length?: number } = {}
) => {
  const halfDimension =
    constantName === "HALF_WIDTH"
      ? (dimensions.width ?? DEFAULT_ROBOT_WIDTH) / 2
      : (dimensions.length ?? DEFAULT_ROBOT_LENGTH) / 2;
  const baseValue = value < 0 ? value - halfDimension : value + halfDimension;
  const operator = value < 0 ? "+" : "-";
  return `${formatKotlinNumber(baseValue)} ${operator} Constants.${constantName}`;
};

export const serializeSavedPosesKotlin = (
  savedPoses: SavedPose[],
  dimensions: { width?: number; length?: number } = {}
) =>
  savedPoses
    .filter((pose) => pose.name.startsWith("START"))
    .map(
      (pose) =>
        `val ${pose.name} = Pose(${formatStartPoseCoordinate(pose.x, "HALF_WIDTH", dimensions)}, ${formatStartPoseCoordinate(pose.y, "HALF_LENGTH", dimensions)}, 0.0)`
    )
    .join("\n");

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

export const sanitizeKotlinClassName = (name: string) => {
  const trimmedName = name.trim();
  return isKotlinIdentifierDraft(trimmedName) && trimmedName ? trimmedName : DEFAULT_AUTON_CLASS_NAME;
};

export const serializePathPlannerKotlin = (
  points: Point[],
  requestedClassName = DEFAULT_AUTON_CLASS_NAME,
  savedPoses: SavedPose[] = []
) => {
  const className = sanitizeKotlinClassName(requestedClassName);
  const pathPoints = points.slice(1);
  const pathNames = createUniquePathNames(points);
  const pathDeclarations = pathPoints
    .map((point, pathIndex) => {
      const previousPoint = points[pathIndex];
      const pathName = pathNames[pathIndex];
      const poses = [
        formatKotlinPose(previousPoint, savedPoses),
        ...(point.controlPoints ?? []).map((controlPoint) => formatKotlinPose(controlPoint, savedPoses)),
        formatKotlinPose(point, savedPoses),
      ];
      const headingMode = point.headingMode ?? "constant";
      const headingCall =
        headingMode === "linear"
          ? `linearHeading(${formatKotlinNumber(point.startHeading ?? 0)}, ${formatKotlinNumber(point.endHeading ?? 0)})`
          : headingMode === "tangential"
            ? "tangentHeading()"
            : `constantHeading(${formatKotlinNumber(point.constantHeading ?? 0)})`;

      return `        val ${pathName} = Path(
${poses.map((pose) => `            ${pose},`).join("\n")}
        ).${headingCall}`;
    })
    .join("\n\n");

  const followPaths = pathPoints
    .map((_, pathIndex) => `            .followPath(${pathNames[pathIndex]})`)
    .join("\n");

  return `package org.firstinspires.ftc.teamcode.opmodes.auto

import gentoo.myrelib.Alliance
import gentoo.myrelib.math.Pose
import gentoo.myrelib.pathing.Path
import org.firstinspires.ftc.teamcode.util.AutonSequence
${savedPoses.length > 0 ? "import org.firstinspires.ftc.teamcode.util.constants.Poses\n" : ""}

class ${className} : Auto(Alliance.BLUE) {
    override fun defineAutonSequence(builder: AutonSequence.Builder): AutonSequence.Builder {
${pathDeclarations || "        // Add paths in the editor before exporting."}

        return builder${followPaths ? `\n${followPaths}` : ""}
    }
}
`;
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
    const savedPose = savedPoses.find((pose) => pose.name === poseReferenceMatch[1]);
    if (savedPose) {
      const normalizedCoords = toNormalizedCoords(savedPose.x, savedPose.y);
      return { ...normalizedCoords, poseName: savedPose.name };
    }
  }

  const match = arg.match(/Pose\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  return toNormalizedCoords(Number(match[1]), Number(match[2]));
};

export const parsePathPlannerKotlin = (contents: string, savedPoses: SavedPose[] = []): ParsedKotlinAuton | null => {
  type ParsedPath = {
    name: string;
    args: string[];
    headingMode: HeadingInterpolation;
    constantHeading: number;
    startHeading: number;
    endHeading: number;
  };

  const pathDefinitions = new Map<string, ParsedPath>();
  const className = sanitizeKotlinClassName(
    contents.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1] ?? DEFAULT_AUTON_CLASS_NAME
  );
  const pathRegex = /val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Path\s*\(/g;
  let pathMatch: RegExpExecArray | null;

  while ((pathMatch = pathRegex.exec(contents)) !== null) {
    const name = pathMatch[1];
    const openParenIndex = contents.indexOf("(", pathMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const args = splitTopLevelArgs(contents.slice(openParenIndex + 1, closeParenIndex));
    const afterPath = contents.slice(closeParenIndex + 1, closeParenIndex + 160);
    const headingMatch = afterPath.match(
      /^\s*\.\s*(constantHeading|linearHeading|tangentHeading)\s*\(([^)]*)\)/
    );

    let headingMode: HeadingInterpolation = "constant";
    let constantHeading = 0;
    let startHeading = 0;
    let endHeading = 0;

    if (headingMatch?.[1] === "linearHeading") {
      headingMode = "linear";
      const values = headingMatch[2]
        .split(",")
        .map((value) => parseFloat(value.trim()))
        .filter((value) => !Number.isNaN(value));
      startHeading = normalizeHeading(values[0] ?? 0);
      endHeading = normalizeHeading(values[1] ?? 0);
    } else if (headingMatch?.[1] === "tangentHeading") {
      headingMode = "tangential";
    } else if (headingMatch?.[1] === "constantHeading") {
      const value = parseFloat(headingMatch[2].trim());
      constantHeading = normalizeHeading(Number.isNaN(value) ? 0 : value);
    }

    pathDefinitions.set(name, { name, args, headingMode, constantHeading, startHeading, endHeading });
    pathRegex.lastIndex = closeParenIndex + 1;
  }

  const followOrder = [...contents.matchAll(/\.followPath\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)].map(
    (match) => match[1]
  );
  const orderedPaths =
    followOrder.length > 0
      ? followOrder.map((name) => pathDefinitions.get(name)).filter((path): path is ParsedPath => Boolean(path))
      : [...pathDefinitions.values()];

  if (orderedPaths.length === 0) return null;

  const firstStart = parseKotlinPose(orderedPaths[0].args[0] ?? "", savedPoses);
  const importedPoints: Point[] = [
    {
      id: INITIAL_POINT_ID,
      nx: firstStart?.nx ?? 0.5,
      ny: firstStart?.ny ?? 0.5,
      color: randomColor(),
      locked: true,
      heading: 0,
      poseName: firstStart?.poseName,
    },
  ];

  orderedPaths.forEach((path) => {
    const parsedArgs = path.args.map((arg) => parseKotlinPose(arg, savedPoses));
    const endPose = [...parsedArgs].reverse().find((pose) => pose !== null);
    if (!endPose) return;

    const firstArgIsPose = parsedArgs[0] !== null;
    const controlPoses = parsedArgs
      .slice(firstArgIsPose ? 1 : 0, -1)
      .filter((pose): pose is ParsedPoseReference => pose !== null);

    importedPoints.push({
      id: generateId(),
      name: path.name,
      nx: endPose.nx,
      ny: endPose.ny,
      poseName: endPose.poseName,
      color: randomColor(),
      locked: false,
      headingMode: path.headingMode,
      constantHeading: path.constantHeading,
      startHeading: path.startHeading,
      endHeading: path.endHeading,
      controlPoints: controlPoses.map((pose) => ({
        id: generateId(),
        nx: pose.nx,
        ny: pose.ny,
        poseName: pose.poseName,
      })),
      controlsExpanded: controlPoses.length > 0,
    });
  });

  return importedPoints.length > 1 ? { className, points: importedPoints } : null;
};
