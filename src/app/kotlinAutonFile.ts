import { INITIAL_POINT_ID } from "./plannerConstants";
import type {
  AutonActionMode,
  AutonAlliance,
  AutonSequenceItem,
  HeadingInterpolation,
  PathActionTrigger,
  Point,
} from "./plannerTypes";
import {
  generateId,
  normalizeHeading,
  toFieldCoords,
  toNormalizedCoords,
} from "./plannerUtils";
import { seededColor } from "./plannerColors";

const formatKotlinNumber = (value: number) => value.toFixed(1);

/**
 * Positions along a path run 0 to 1, so a single decimal — fine for inches and
 * degrees — only leaves eleven places to put a trigger, and quietly rewrites a
 * team's own `.startAt(0.35, ...)` as `0.4` on a round trip. The parser keeps
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
  x: number;
  y: number;
  heading: number;
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
  heading?: number;
  poseName?: string;
};

export const stripStartPosePrefix = (name: string) =>
  name.startsWith(START_POSE_PREFIX) ? name.slice(START_POSE_PREFIX.length) : name;

const withStartPosePrefix = (name: string) =>
  name.startsWith(START_POSE_PREFIX) ? name : `${START_POSE_PREFIX}${name}`;

// Stand-ins for a typical FTC drivetrain, used until the team imports their own
// tuned constants. Zeroes would be read as "no limit" by the motion profile and
// silently fall back to 1 in/s, which makes every playback estimate nonsense.
export const DEFAULT_ROBOT_CONSTANTS: RobotConstants = {
  width: DEFAULT_ROBOT_WIDTH,
  length: DEFAULT_ROBOT_LENGTH,
  forwardBrakeStrength: 35,
  lateralBrakeStrength: 70,
  maxForwardVelocity: 60,
  maxLateralVelocity: 45,
};

const findMatchingSavedPose = (point: { nx: number; ny: number; poseName?: string }, savedPoses: SavedPose[]) => {
  const coords = toFieldCoords(point.nx, point.ny);
  const pointPoseName = point.poseName?.trim();
  const poseNameMatch = pointPoseName
    ? savedPoses.find(
        (pose) =>
          stripStartPosePrefix(pose.name) === stripStartPosePrefix(pointPoseName) &&
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
  if (savedPose) return `Poses.${withStartPosePrefix(savedPose.name)}`;

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
    const name = stripStartPosePrefix(poseMatch[1]);
    if (usedNames.has(name)) continue;

    const openParenIndex = contents.indexOf("(", poseMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const args = splitTopLevelArgs(contents.slice(openParenIndex + 1, closeParenIndex)).map(stripLineComment);
    const x = evaluatePoseExpression(args[0] ?? "", width, length);
    const y = evaluatePoseExpression(args[1] ?? "", width, length);
    const heading = evaluatePoseExpression(args[2] ?? "0", width, length);
    if (x === null || y === null) continue;

    usedNames.add(name);
    savedPoses.push({ name, x, y, heading: normalizeHeading(heading ?? 0) });
    poseRegex.lastIndex = closeParenIndex + 1;
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

const formatFollowPathCall = (pathName: string, point?: Point) => {
  const triggers = [...(point?.actionTriggers ?? [])].sort((a, b) => a.t - b.t);
  if (triggers.length === 0) return `    .followPath(${pathName})`;

  return `    .followPath(
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
      const poses = [
        formatKotlinPose(previousPoint, savedPoses),
        ...(point.controlPoints ?? []).map((controlPoint) => formatKotlinPose(controlPoint, savedPoses)),
        formatKotlinPose(point, savedPoses),
      ];
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
${poses.map((pose) => `    ${pose},`).join("\n")}
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
      return pathName ? formatFollowPathCall(pathName, pointById.get(item.pointId)) : "";
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
    const poseName = stripStartPosePrefix(poseReferenceMatch[1]);
    const savedPose = savedPoses.find((pose) => stripStartPosePrefix(pose.name) === poseName);
    if (savedPose) {
      const normalizedCoords = toNormalizedCoords(savedPose.x, savedPose.y);
      return {
        ...normalizedCoords,
        heading: savedPose.heading ?? 0,
        poseName: stripStartPosePrefix(savedPose.name),
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
    args: string[];
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

    pathDefinitions.set(name, { name, args, headingMode, constantHeading, startHeading, endHeading, linearStartT, linearEndT, tangentReversed });
    pathRegex.lastIndex = closeParenIndex + 1;
  }

  const builderCalls: ParsedBuilderCall[] = [];
  const builderCallRegex = /\.(followPath|start|stop|run)\s*\(/g;
  let builderCallMatch: RegExpExecArray | null;

  while ((builderCallMatch = builderCallRegex.exec(contents)) !== null) {
    const method = builderCallMatch[1];
    const openParenIndex = contents.indexOf("(", builderCallMatch.index);
    const closeParenIndex = findMatchingParen(contents, openParenIndex);
    if (closeParenIndex < 0) continue;

    const callContents = contents.slice(openParenIndex + 1, closeParenIndex);
    const args = splitTopLevelArgs(callContents);
    if (method === "followPath") {
      const pathName = callContents.match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
      if (pathName) {
        const triggers: PathActionTrigger[] = [...callContents.matchAll(/\.(startAt|stopAt)\s*\(([^)]*)\)/g)]
          .map((triggerMatch) => {
            const triggerArgs = splitTopLevelArgs(triggerMatch[2]);
            const t = Number.parseFloat(triggerArgs[0] ?? "0");
            const actionName = triggerArgs[1]?.match(/\bActions\.([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1] ?? "ACTION";
            return {
              id: generateId(),
              mode: triggerMatch[1] === "startAt" ? "start" as const : "stop" as const,
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
  // One entry per followPath call rather than per path name. A cycling auton
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

  const firstStart = parseKotlinPose(orderedPaths[0].path.args[0] ?? "", savedPoses);
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
    const parsedArgs = path.args.map((arg) => parseKotlinPose(arg, savedPoses));
    const endPose = [...parsedArgs].reverse().find((pose) => pose !== null);
    if (!endPose) {
      pathPointIdsByFollowIndex.push(null);
      return;
    }

    const firstArgIsPose = parsedArgs[0] !== null;
    const controlPoses = parsedArgs
      .slice(firstArgIsPose ? 1 : 0, -1)
      .filter((pose): pose is ParsedPoseReference => pose !== null);

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
      controlPoints: controlPoses.map((pose) => ({
        id: generateId(),
        nx: pose.nx,
        ny: pose.ny,
        poseName: pose.poseName,
      })),
      controlsExpanded: controlPoses.length > 0,
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
