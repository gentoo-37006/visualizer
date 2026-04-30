import { INITIAL_POINT_ID } from "./plannerConstants";
import type { HeadingInterpolation, Point } from "./plannerTypes";
import {
  generateId,
  normalizeHeading,
  randomColor,
  toFieldCoords,
  toNormalizedCoords,
} from "./plannerUtils";

const formatKotlinNumber = (value: number) => value.toFixed(1);

const formatKotlinPose = (point: { nx: number; ny: number }) => {
  const coords = toFieldCoords(point.nx, point.ny);
  return `Pose(${formatKotlinNumber(coords.x)}, ${formatKotlinNumber(coords.y)})`;
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

export const serializePathPlannerKotlin = (points: Point[]) => {
  const className = "GeneratedAutonPath";
  const pathPoints = points.slice(1);
  const pathNames = createUniquePathNames(points);
  const pathDeclarations = pathPoints
    .map((point, pathIndex) => {
      const previousPoint = points[pathIndex];
      const pathName = pathNames[pathIndex];
      const poses = [
        formatKotlinPose(previousPoint),
        ...(point.controlPoints ?? []).map(formatKotlinPose),
        formatKotlinPose(point),
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

const parseKotlinPose = (arg: string) => {
  const match = arg.match(/Pose\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  return toNormalizedCoords(Number(match[1]), Number(match[2]));
};

export const parsePathPlannerKotlin = (contents: string): Point[] | null => {
  type ParsedPath = {
    name: string;
    args: string[];
    headingMode: HeadingInterpolation;
    constantHeading: number;
    startHeading: number;
    endHeading: number;
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

  const firstStart = parseKotlinPose(orderedPaths[0].args[0] ?? "");
  const importedPoints: Point[] = [
    {
      id: INITIAL_POINT_ID,
      nx: firstStart?.nx ?? 0.5,
      ny: firstStart?.ny ?? 0.5,
      color: randomColor(),
      locked: true,
      heading: 0,
    },
  ];

  orderedPaths.forEach((path) => {
    const parsedArgs = path.args.map((arg) => parseKotlinPose(arg));
    const endPose = [...parsedArgs].reverse().find((pose) => pose !== null);
    if (!endPose) return;

    const firstArgIsPose = parsedArgs[0] !== null;
    const controlPoses = parsedArgs
      .slice(firstArgIsPose ? 1 : 0, -1)
      .filter((pose): pose is { nx: number; ny: number } => pose !== null);

    importedPoints.push({
      id: generateId(),
      name: path.name,
      nx: endPose.nx,
      ny: endPose.ny,
      color: randomColor(),
      locked: false,
      headingMode: path.headingMode,
      constantHeading: path.constantHeading,
      startHeading: path.startHeading,
      endHeading: path.endHeading,
      controlPoints: controlPoses.map((pose) => ({ id: generateId(), nx: pose.nx, ny: pose.ny })),
      controlsExpanded: controlPoses.length > 0,
    });
  });

  return importedPoints.length > 1 ? importedPoints : null;
};
