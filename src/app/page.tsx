"use client";

import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from "react";
import Image from "next/image";
import styles from "./page.module.css";

// --- Types & Constants ---
type Point = {
  id: string;
  name?: string;
  nx: number; // Normalized x (0 to 1)
  ny: number; // Normalized y (0 to 1)
  color: string;
  locked: boolean;
  heading?: number;
  headingMode?: HeadingInterpolation;
  constantHeading?: number;
  startHeading?: number;
  endHeading?: number;
  controlPoints?: ControlPoint[];
  controlsExpanded?: boolean;
};

type ControlPoint = {
  id: string;
  nx: number;
  ny: number;
};

type HeadingInterpolation = "constant" | "linear" | "tangential";
type PathHeadingField = "constant" | "start" | "end";
type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "control"; pathIndex: number; controlIndex: number };

const FIELD_SIZE_INCHES = 144;
const POINT_DIAMETER = 20;
const CONTROL_POINT_DIAMETER = POINT_DIAMETER;
const POINT_RADIUS = POINT_DIAMETER / 2;
const CONTROL_POINT_RADIUS = CONTROL_POINT_DIAMETER / 2;
const FIELD_BORDER_WIDTH = 3;
const INITIAL_POINT_ID = "init-point";
const INITIAL_POINT_COLOR = "rgb(59, 130, 246)";

type FieldSize = {
  width: number;
  height: number;
};

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const randomColor = () => {
  const min = 120;
  const range = 256 - min;
  const r = Math.floor(Math.random() * range) + min;
  const g = Math.floor(Math.random() * range) + min;
  const b = Math.floor(Math.random() * range) + min;
  return `rgb(${r}, ${g}, ${b})`;
};

const toFieldCoords = (nx: number, ny: number) => {
  const x = (nx - 0.5) * FIELD_SIZE_INCHES;
  const y = (0.5 - ny) * FIELD_SIZE_INCHES;
  return { x, y };
};

const toNormalizedCoords = (x: number, y: number) => {
  let nx = x / FIELD_SIZE_INCHES + 0.5;
  let ny = 0.5 - y / FIELD_SIZE_INCHES;
  // clamp
  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));
  return { nx, ny };
};

const normalizeHeading = (degrees: number) => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && degrees > 0 ? 180 : normalized;
};

const isNumericDraft = (value: string) => /^-?(?:\d+)?(?:\.\d*)?$/.test(value);
const isKotlinIdentifierDraft = (value: string) => value === "" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

const createDefaultHeadingValues = () => ({
  headingMode: "constant" as HeadingInterpolation,
  constantHeading: 0,
  startHeading: 0,
  endHeading: 0,
  controlPoints: [] as ControlPoint[],
  controlsExpanded: true,
});

const toSvgPixelCoords = (nx: number, ny: number, fieldSize: FieldSize) => ({
  x: POINT_RADIUS + FIELD_BORDER_WIDTH + nx * (fieldSize.width - FIELD_BORDER_WIDTH * 2),
  y: POINT_RADIUS + FIELD_BORDER_WIDTH + ny * (fieldSize.height - FIELD_BORDER_WIDTH * 2),
});

const interpolateBezierPoint = (points: Array<{ x: number; y: number }>, t: number) => {
  let workingPoints = points.map((point) => ({ ...point }));

  while (workingPoints.length > 1) {
    workingPoints = workingPoints.slice(0, -1).map((point, index) => ({
      x: point.x + (workingPoints[index + 1].x - point.x) * t,
      y: point.y + (workingPoints[index + 1].y - point.y) * t,
    }));
  }

  return workingPoints[0];
};

const createSplinePath = (
  start: { x: number; y: number },
  controls: Array<{ x: number; y: number }>,
  end: { x: number; y: number }
) => {
  const bezierPoints = [start, ...controls, end];
  const sampleCount = Math.max(24, controls.length * 16);
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) =>
    interpolateBezierPoint(bezierPoints, index / sampleCount)
  );

  return samples
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
};

const isSameTarget = (a: DragTarget | null, b: DragTarget | null) => {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") return a.index === b.index;
  if (a.kind === "control" && b.kind === "control") {
    return a.pathIndex === b.pathIndex && a.controlIndex === b.controlIndex;
  }
  return false;
};

const targetPathIndex = (target: DragTarget | null) => {
  if (!target) return null;
  return target.kind === "point" ? target.index : target.pathIndex;
};

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

const serializePathPlannerKotlin = (points: Point[]) => {
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

const parsePathPlannerKotlin = (contents: string): Point[] | null => {
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
      locked: false,
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

export default function PathPlannerPage() {
  const [points, setPoints] = useState<Point[]>([
    { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: INITIAL_POINT_COLOR, locked: false, heading: 0 },
  ]);
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const [activeTarget, setActiveTarget] = useState<DragTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [fieldSize, setFieldSize] = useState<FieldSize>({ width: 0, height: 0 });

  const fieldRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const hasMeasuredField = fieldSize.width > 0 && fieldSize.height > 0;

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFieldSize((current) => {
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    });

    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPoints((currentPoints) =>
        currentPoints.map((point) =>
          point.id === INITIAL_POINT_ID ? { ...point, color: randomColor() } : point
        )
      );
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift") setIsShiftPressed(true);
    };
    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift") setIsShiftPressed(false);
    };
    const handleBlur = () => setIsShiftPressed(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // --- Handlers ---
  const handleAddPoint = () => {
    const seed = points.length > 0 ? points[points.length - 1] : { nx: 0.5, ny: 0.5 };
    setPoints([
      ...points,
      {
        id: generateId(),
        name: `path${points.length}`,
        nx: seed.nx,
        ny: seed.ny,
        color: randomColor(),
        locked: false,
        ...createDefaultHeadingValues(),
      },
    ]);
  };

  const handleRemovePoint = (index: number) => {
    setPoints(points.filter((_, i) => i !== index));
    if (targetPathIndex(activeTarget) === index) setActiveTarget(null);
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const handleToggleLocked = (index: number) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, locked: !point.locked } : point
      )
    );
    if (targetPathIndex(activeTarget) === index) {
      setActiveTarget(null);
      setIsDragging(false);
    }
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const handleRenamePath = (index: number, name: string) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) => (i === index ? { ...point, name } : point))
    );
  };

  const updatePoint = (index: number, nx: number, ny: number) => {
    const newPoints = [...points];
    newPoints[index] = { ...newPoints[index], nx, ny };
    setPoints(newPoints);
  };

  const updateControlPoint = (pathIndex: number, controlIndex: number, nx: number, ny: number) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i !== pathIndex) return point;
        return {
          ...point,
          controlPoints: (point.controlPoints ?? []).map((controlPoint, j) =>
            j === controlIndex ? { ...controlPoint, nx, ny } : controlPoint
          ),
        };
      })
    );
  };

  const updateTargetPosition = (target: DragTarget, nx: number, ny: number) => {
    if (target.kind === "point") {
      updatePoint(target.index, nx, ny);
    } else {
      updateControlPoint(target.pathIndex, target.controlIndex, nx, ny);
    }
  };

  const handleToggleControlsExpanded = (index: number) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, controlsExpanded: !(point.controlsExpanded ?? true) } : point
      )
    );
  };

  const handleAddControlPoint = (index: number) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i !== index) return point;
        const controlPoints = point.controlPoints ?? [];
        const previousPoint = currentPoints[index - 1];
        const seed = controlPoints[controlPoints.length - 1] ?? {
          nx: previousPoint ? (previousPoint.nx + point.nx) / 2 : point.nx,
          ny: previousPoint ? (previousPoint.ny + point.ny) / 2 : point.ny,
        };

        return {
          ...point,
          controlPoints: [...controlPoints, { id: generateId(), nx: seed.nx, ny: seed.ny }],
          controlsExpanded: true,
        };
      })
    );
  };

  const handleControlCoordChange = (
    pathIndex: number,
    controlIndex: number,
    axis: "x" | "y",
    value: string
  ) => {
    const controlPoint = points[pathIndex].controlPoints?.[controlIndex];
    if (!controlPoint) return;

    const currentField = toFieldCoords(controlPoint.nx, controlPoint.ny);
    const num = parseFloat(value);
    if (isNaN(num)) return;

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    updateControlPoint(pathIndex, controlIndex, nx, ny);
  };

  const handleCoordChange = (index: number, axis: "x" | "y", value: string) => {
    const p = points[index];
    const currentField = toFieldCoords(p.nx, p.ny);
    
    // Allow typing by just storing the value if it's invalid temporarily, 
    // but here we just parse it. A better UX would use local state for inputs.
    const num = parseFloat(value);
    if (isNaN(num)) return; // Simple handling, could be improved

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    updatePoint(index, nx, ny);
  };

  const handleHeadingChange = (value: string) => {
    const heading = parseFloat(value);
    if (isNaN(heading)) return;

    setPoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === INITIAL_POINT_ID
          ? { ...point, heading: normalizeHeading(heading) }
          : point
      )
    );
  };

  const handlePathInterpolationChange = (index: number, mode: HeadingInterpolation) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index
          ? { ...createDefaultHeadingValues(), ...point, headingMode: mode }
          : point
      )
    );
  };

  const handlePathHeadingChange = (index: number, field: PathHeadingField, value: string) => {
    const heading = parseFloat(value);
    if (isNaN(heading)) return;

    const normalizedHeading = normalizeHeading(heading);
    const key =
      field === "constant"
        ? "constantHeading"
        : field === "start"
          ? "startHeading"
          : "endHeading";

    setPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, [key]: normalizedHeading } : point
      )
    );
  };

  const handleExportKotlin = () => {
    const contents = serializePathPlannerKotlin(points);
    const blob = new Blob([contents], { type: "text/x-kotlin;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "AutonPath.kt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportKotlinClick = () => {
    importInputRef.current?.click();
  };

  const handleImportKotlin = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const contents = await file.text();
      const importedPoints = parsePathPlannerKotlin(contents);
      if (!importedPoints || importedPoints.length === 0) {
        window.alert("This Kotlin file does not contain an Auton Path Planner export.");
        return;
      }

      setPoints(importedPoints);
      setHoverTarget(null);
      setActiveTarget(null);
      setIsDragging(false);
    } catch {
      window.alert("Unable to import this Kotlin file.");
    }
  };

  // --- Pointer Events for SVG ---
  const getPointerNormalized = (e: React.PointerEvent<SVGSVGElement> | PointerEvent) => {
    if (!svgRef.current) return { nx: 0, ny: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const fieldWidth = rect.width - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    const fieldHeight = rect.height - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    let nx = (e.clientX - rect.left - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldWidth;
    let ny = (e.clientY - rect.top - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldHeight;
    
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    
    return { nx, ny };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (hoverTarget !== null && !points[targetPathIndex(hoverTarget) ?? 0].locked) {
      setIsDragging(true);
      setActiveTarget(hoverTarget);
      // Optional: allow set pointer capture for better dragging outside
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging && activeTarget !== null) {
      const { nx, ny } = getPointerNormalized(e);
      updateTargetPosition(activeTarget, nx, ny);
    } else {
      // Hit testing for hover
      if (!svgRef.current) return;
      const { nx, ny } = getPointerNormalized(e);
      const minFieldSize = Math.min(
        fieldSize.width - FIELD_BORDER_WIDTH * 2,
        fieldSize.height - FIELD_BORDER_WIDTH * 2
      );
      if (minFieldSize <= 0) return;
      const hitRadiusNormalized = POINT_RADIUS / minFieldSize;
      const controlHitRadiusNormalized = CONTROL_POINT_RADIUS / minFieldSize;

      let hit: DragTarget | null = null;
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].locked) continue;
        const controlPoints = points[i].controlPoints ?? [];
        for (let j = controlPoints.length - 1; j >= 0; j--) {
          const dx = controlPoints[j].nx - nx;
          const dy = controlPoints[j].ny - ny;
          if (Math.sqrt(dx * dx + dy * dy) <= controlHitRadiusNormalized) {
            hit = { kind: "control", pathIndex: i, controlIndex: j };
            break;
          }
        }
        if (hit) break;
        const dx = points[i].nx - nx;
        const dy = points[i].ny - ny;
        if (Math.sqrt(dx * dx + dy * dy) <= hitRadiusNormalized) {
          hit = { kind: "point", index: i };
          break;
        }
      }
      setHoverTarget(hit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    if (svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.fieldWrapper}>
        <div className={styles.fieldContainer} ref={fieldRef}>
          <Image
            src="/fields/decode.webp"
            alt="Field Map"
            fill
            priority
            sizes="(max-width: 768px) 100vw, (max-height: 100vh) 100vh, 1000px"
            className={styles.fieldImage}
          />
          <svg
            ref={svgRef}
            className={styles.svgOverlay}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => { if (!isDragging) setHoverTarget(null); }}
            style={{ 
              cursor: isDragging ? 'grabbing' : (hoverTarget !== null ? 'pointer' : 'default') 
            }}
            viewBox={`0 0 ${fieldSize.width + POINT_DIAMETER} ${fieldSize.height + POINT_DIAMETER}`}
          >
            {/* Draw Lines */}
            {hasMeasuredField && points.map((p, i) => {
              if (i === points.length - 1) return null;
              const nextP = points[i + 1];
              const start = toSvgPixelCoords(p.nx, p.ny, fieldSize);
              const end = toSvgPixelCoords(nextP.nx, nextP.ny, fieldSize);
              const controlPoints = (nextP.controlPoints ?? []).map((controlPoint) =>
                toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize)
              );
              if (controlPoints.length > 0) {
                return (
                  <path
                    key={`line-${p.id}`}
                    d={createSplinePath(start, controlPoints, end)}
                    fill="none"
                    stroke={nextP.color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }

              return (
                <line
                  key={`line-${p.id}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={nextP.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Draw Points */}
            {hasMeasuredField && points.map((p, i) => {
              const { x, y } = toSvgPixelCoords(p.nx, p.ny, fieldSize);
              const isHovered = isSameTarget(hoverTarget, { kind: "point", index: i }) && !p.locked;

              return (
                <g key={`point-${p.id}`}>
                  {isHovered && (
                    <circle
                      cx={x}
                      cy={y}
                      r={POINT_DIAMETER / 2}
                      fill="rgba(0,0,0,0.45)"
                      filter="blur(4px)"
                      transform="translate(0 2)"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={POINT_DIAMETER / 2}
                    fill={p.color}
                    stroke={isHovered ? "white" : "transparent"}
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {/* Draw Control Points */}
            {hasMeasuredField && points.map((p, i) =>
              (p.controlPoints ?? []).map((controlPoint, j) => {
                const { x, y } = toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize);
                const isHovered =
                  isSameTarget(hoverTarget, { kind: "control", pathIndex: i, controlIndex: j }) && !p.locked;

                return (
                  <g key={`control-${controlPoint.id}`}>
                    {isHovered && (
                      <circle
                        cx={x}
                        cy={y}
                        r={CONTROL_POINT_RADIUS}
                        fill="rgba(0,0,0,0.45)"
                        filter="blur(4px)"
                        transform="translate(0 2)"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={CONTROL_POINT_RADIUS}
                      fill={p.color}
                      stroke={isHovered ? "white" : "transparent"}
                      strokeWidth="1.5"
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#111827"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="central"
                      pointerEvents="none"
                    >
                      {j + 1}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            <h1 className={styles.sidebarTitle}>Path Planner</h1>
            <div className={styles.importExportActions}>
              <button
                className={styles.secondaryIconButton}
                onClick={handleImportKotlinClick}
                aria-label="Import Kotlin"
                title="Import Kotlin"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button
                className={styles.secondaryIconButton}
                onClick={handleExportKotlin}
                aria-label="Export Kotlin"
                title="Export Kotlin"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>
              <input
                ref={importInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".kt,text/x-kotlin,text/plain"
                onChange={handleImportKotlin}
              />
            </div>
          </div>
        </div>
        
        <div className={styles.pointsList}>
          {points.map((p, i) => {
            const coords = toFieldCoords(p.nx, p.ny);
            return (
              <PointCard
                key={p.id}
                index={i}
                name={p.name ?? `Path ${i}`}
                color={p.color}
                locked={p.locked}
                x={coords.x}
                y={coords.y}
                heading={p.heading}
                headingMode={p.headingMode ?? "constant"}
                constantHeading={p.constantHeading ?? 0}
                startHeading={p.startHeading ?? 0}
                endHeading={p.endHeading ?? 0}
                controlPoints={(p.controlPoints ?? []).map((controlPoint) => ({
                  id: controlPoint.id,
                  ...toFieldCoords(controlPoint.nx, controlPoint.ny),
                }))}
                controlPointCount={(p.controlPoints ?? []).length}
                controlsExpanded={p.controlsExpanded ?? true}
                isActive={targetPathIndex(hoverTarget) === i || targetPathIndex(activeTarget) === i}
                onChange={(axis, val) => handleCoordChange(i, axis, val)}
                onRename={i > 0 ? (name) => handleRenamePath(i, name) : undefined}
                onHeadingChange={i === 0 ? handleHeadingChange : undefined}
                onInterpolationChange={
                  i > 0 ? (mode) => handlePathInterpolationChange(i, mode) : undefined
                }
                onPathHeadingChange={
                  i > 0 ? (field, val) => handlePathHeadingChange(i, field, val) : undefined
                }
                onToggleLocked={() => handleToggleLocked(i)}
                onToggleControlsExpanded={
                  i > 0 ? () => handleToggleControlsExpanded(i) : undefined
                }
                onAddControlPoint={i > 0 ? () => handleAddControlPoint(i) : undefined}
                onControlPointChange={
                  i > 0
                    ? (controlIndex, axis, val) => handleControlCoordChange(i, controlIndex, axis, val)
                    : undefined
                }
                canDelete={isShiftPressed}
                onDelete={() => handleRemovePoint(i)}
              />
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <button className={styles.addButton} onClick={handleAddPoint}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Path
          </button>
        </div>
      </aside>
    </main>
  );
}

// --- Subcomponents ---

function PointCard({
  index,
  name,
  color,
  locked,
  x,
  y,
  heading,
  headingMode,
  constantHeading,
  startHeading,
  endHeading,
  controlPoints,
  controlPointCount,
  controlsExpanded,
  isActive,
  onChange,
  onRename,
  onHeadingChange,
  onInterpolationChange,
  onPathHeadingChange,
  onToggleLocked,
  onToggleControlsExpanded,
  onAddControlPoint,
  onControlPointChange,
  canDelete,
  onDelete
}: {
  index: number;
  name: string;
  color: string;
  locked: boolean;
  x: number;
  y: number;
  heading?: number;
  headingMode: HeadingInterpolation;
  constantHeading: number;
  startHeading: number;
  endHeading: number;
  controlPoints: Array<{ id: string; x: number; y: number }>;
  controlPointCount: number;
  controlsExpanded: boolean;
  isActive: boolean;
  onChange: (axis: "x" | "y", val: string) => void;
  onRename?: (name: string) => void;
  onHeadingChange?: (val: string) => void;
  onInterpolationChange?: (mode: HeadingInterpolation) => void;
  onPathHeadingChange?: (field: PathHeadingField, val: string) => void;
  onToggleLocked: () => void;
  onToggleControlsExpanded?: () => void;
  onAddControlPoint?: () => void;
  onControlPointChange?: (controlIndex: number, axis: "x" | "y", val: string) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | "heading" | PathHeadingField | null>(null);
  const [draftX, setDraftX] = useState("");
  const [draftY, setDraftY] = useState("");
  const [draftHeading, setDraftHeading] = useState("");
  const [draftPathHeading, setDraftPathHeading] = useState("");
  const [draftName, setDraftName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const startEditing = (axis: "x" | "y" | "heading" | PathHeadingField) => {
    setEditingAxis(axis);
    if (axis === "x") {
      setDraftX(x.toFixed(1));
    } else if (axis === "y") {
      setDraftY(y.toFixed(1));
    } else if (axis === "heading") {
      setDraftHeading((heading ?? 0).toFixed(1));
    } else {
      const value =
        axis === "constant"
          ? constantHeading
          : axis === "start"
            ? startHeading
            : endHeading;
      setDraftPathHeading(value.toFixed(1));
    }
  };

  const commitEdit = (axis: "x" | "y" | "heading" | PathHeadingField, val: string) => {
    if (axis === "heading") {
      onHeadingChange?.(val);
    } else if (axis === "constant" || axis === "start" || axis === "end") {
      onPathHeadingChange?.(axis, val);
    } else {
      onChange(axis, val);
    }
    setEditingAxis(null);
  };

  const updateCoordinateDraft = (axis: "x" | "y", val: string) => {
    if (!isNumericDraft(val)) return;

    if (axis === "x") {
      setDraftX(val);
    } else {
      setDraftY(val);
    }

    onChange(axis, val);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    axis: "x" | "y" | "heading" | PathHeadingField,
    val: string
  ) => {
    if (e.key === "Enter") {
      commitEdit(axis, val);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) return;
    onDelete();
  };

  const handleNameFocus = () => {
    setIsEditingName(true);
    setDraftName(name);
  };

  const handleNameBlur = () => {
    const trimmedName = draftName.trim();
    onRename?.(trimmedName || `path${index}`);
    setIsEditingName(false);
  };

  return (
    <div 
      className={`${styles.pointCard} ${isActive ? styles.active : ''}`}
      style={{ '--point-color': color } as React.CSSProperties}
    >
      <div className={styles.pointCardHeader}>
        {index === 0 ? (
          <span className={styles.pointTitle}>Start Pose</span>
        ) : (
          <input
            className={styles.pathNameInput}
            maxLength={16}
            value={isEditingName ? draftName : name}
            onFocus={handleNameFocus}
            onChange={(e) => {
              if (!isKotlinIdentifierDraft(e.target.value)) return;
              setDraftName(e.target.value);
              onRename?.(e.target.value);
            }}
            onBlur={handleNameBlur}
            aria-label={`Rename path ${index}`}
          />
        )}
        <div className={styles.cardActions}>
          <button
            className={`${styles.iconButton} ${styles.lockButton} ${locked ? styles.lockedButton : ""}`}
            onClick={onToggleLocked}
            aria-label={locked ? "Locked" : "Unlocked"}
            title={locked ? "Locked" : "Unlocked"}
          >
            {!locked ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            )}
          </button>
          {index > 0 && (
            <span className={styles.deleteAction}>
              <button
                className={`${styles.iconButton} ${styles.deleteButton} ${canDelete ? styles.deleteArmed : ""}`}
                onClick={handleDeleteClick}
                aria-label="Delete path"
                aria-describedby={!canDelete ? `delete-tooltip-${index}` : undefined}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
              {!canDelete && (
                <span id={`delete-tooltip-${index}`} className={styles.deleteTooltip} role="tooltip">
                  Hold Shift to delete
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className={styles.coordRow}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>X (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "x" ? draftX : x.toFixed(1)}
            onFocus={() => startEditing("x")}
            onChange={(e) => updateCoordinateDraft("x", e.target.value)}
            onBlur={(e) => commitEdit("x", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "x", e.currentTarget.value)}
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Y (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "y" ? draftY : y.toFixed(1)}
            onFocus={() => startEditing("y")}
            onChange={(e) => updateCoordinateDraft("y", e.target.value)}
            onBlur={(e) => commitEdit("y", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "y", e.currentTarget.value)}
          />
        </div>
        {index === 0 && (
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Heading (deg)</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.inputField}
              value={editingAxis === "heading" ? draftHeading : (heading ?? 0).toFixed(1)}
              onFocus={() => startEditing("heading")}
              onChange={(e) => {
                if (isNumericDraft(e.target.value)) setDraftHeading(e.target.value);
              }}
              onBlur={(e) => commitEdit("heading", e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "heading", e.currentTarget.value)}
            />
          </div>
        )}
        {index > 0 && (
          <>
          <div className={styles.selectGroup}>
            <label className={styles.inputLabel}>Heading</label>
            <select
              className={styles.selectField}
              value={headingMode}
              onChange={(e) => onInterpolationChange?.(e.target.value as HeadingInterpolation)}
            >
              <option value="constant">Constant</option>
              <option value="linear">Linear</option>
              <option value="tangential">Tangential</option>
            </select>
          </div>
          {headingMode === "constant" && (
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Value</label>
              <input
                type="text"
                inputMode="decimal"
                className={styles.inputField}
                value={editingAxis === "constant" ? draftPathHeading : constantHeading.toFixed(1)}
                onFocus={() => startEditing("constant")}
                onChange={(e) => {
                  if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                }}
                onBlur={(e) => commitEdit("constant", e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, "constant", e.currentTarget.value)}
              />
            </div>
          )}
          {headingMode === "linear" && (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Start</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.inputField}
                  value={editingAxis === "start" ? draftPathHeading : startHeading.toFixed(1)}
                  onFocus={() => startEditing("start")}
                  onChange={(e) => {
                    if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                  }}
                  onBlur={(e) => commitEdit("start", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "start", e.currentTarget.value)}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>End</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.inputField}
                  value={editingAxis === "end" ? draftPathHeading : endHeading.toFixed(1)}
                  onFocus={() => startEditing("end")}
                  onChange={(e) => {
                    if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                  }}
                  onBlur={(e) => commitEdit("end", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "end", e.currentTarget.value)}
                />
              </div>
            </>
          )}
          </>
        )}
      </div>
      {index > 0 && (
        <div className={styles.controlPointsPanel}>
          <div className={styles.controlPointsHeader}>
            <button
              className={styles.controlPointsToggle}
              onClick={onToggleControlsExpanded}
              aria-expanded={controlsExpanded}
            >
              <svg
                className={`${styles.chevronIcon} ${controlsExpanded ? styles.chevronOpen : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Control Points ({controlPointCount})</span>
            </button>
            <button className={styles.addControlPointButton} onClick={onAddControlPoint}>
              <span aria-hidden="true">+</span>
              Add
            </button>
          </div>
          {controlsExpanded && controlPoints.length > 0 && (
            <div className={styles.controlPointsBody}>
              {controlPoints.map((controlPoint, controlIndex) => (
                <ControlPointCard
                  key={controlPoint.id}
                  index={controlIndex}
                  x={controlPoint.x}
                  y={controlPoint.y}
                  onChange={(axis, val) => onControlPointChange?.(controlIndex, axis, val)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ControlPointCard({
  index,
  x,
  y,
  onChange,
}: {
  index: number;
  x: number;
  y: number;
  onChange: (axis: "x" | "y", val: string) => void;
}) {
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | null>(null);
  const [draftX, setDraftX] = useState("");
  const [draftY, setDraftY] = useState("");

  const startEditing = (axis: "x" | "y") => {
    setEditingAxis(axis);
    if (axis === "x") {
      setDraftX(x.toFixed(1));
    } else {
      setDraftY(y.toFixed(1));
    }
  };

  const updateDraft = (axis: "x" | "y", val: string) => {
    if (!isNumericDraft(val)) return;

    if (axis === "x") {
      setDraftX(val);
    } else {
      setDraftY(val);
    }
    onChange(axis, val);
  };

  const commitEdit = (axis: "x" | "y", val: string) => {
    onChange(axis, val);
    setEditingAxis(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, axis: "x" | "y", val: string) => {
    if (e.key === "Enter") {
      commitEdit(axis, val);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className={styles.controlPointCard}>
      <div className={styles.controlPointTitleRow}>
        <span className={styles.controlPointTitle}>Control Point {index + 1}</span>
      </div>
      <div className={styles.controlPointInputs}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>X (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "x" ? draftX : x.toFixed(1)}
            onFocus={() => startEditing("x")}
            onChange={(e) => updateDraft("x", e.target.value)}
            onBlur={(e) => commitEdit("x", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "x", e.currentTarget.value)}
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Y (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "y" ? draftY : y.toFixed(1)}
            onFocus={() => startEditing("y")}
            onChange={(e) => updateDraft("y", e.target.value)}
            onBlur={(e) => commitEdit("y", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "y", e.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}
