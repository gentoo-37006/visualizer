"use client";

import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from "react";
import Image from "next/image";
import styles from "./page.module.css";

// --- Types & Constants ---
type Point = {
  id: string;
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
const CONTROL_POINT_DIAMETER = 14;
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
                      stroke={isHovered ? "white" : "rgba(255,255,255,0.65)"}
                      strokeWidth="1.5"
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#111827"
                      fontSize="9"
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
          <h1 className={styles.sidebarTitle}>Path Planner</h1>
        </div>
        
        <div className={styles.pointsList}>
          {points.map((p, i) => {
            const coords = toFieldCoords(p.nx, p.ny);
            return (
              <PointCard
                key={p.id}
                index={i}
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

  return (
    <div 
      className={`${styles.pointCard} ${isActive ? styles.active : ''}`}
      style={{ '--point-color': color } as React.CSSProperties}
    >
      <div className={styles.pointCardHeader}>
        <span className={styles.pointTitle}>{index === 0 ? "Start Pose" : `Path ${index}`}</span>
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
              className={styles.inputField}
              value={editingAxis === "heading" ? draftHeading : (heading ?? 0).toFixed(1)}
              onFocus={() => startEditing("heading")}
              onChange={(e) => setDraftHeading(e.target.value)}
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
                className={styles.inputField}
                value={editingAxis === "constant" ? draftPathHeading : constantHeading.toFixed(1)}
                onFocus={() => startEditing("constant")}
                onChange={(e) => setDraftPathHeading(e.target.value)}
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
                  className={styles.inputField}
                  value={editingAxis === "start" ? draftPathHeading : startHeading.toFixed(1)}
                  onFocus={() => startEditing("start")}
                  onChange={(e) => setDraftPathHeading(e.target.value)}
                  onBlur={(e) => commitEdit("start", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "start", e.currentTarget.value)}
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>End</label>
                <input
                  type="text"
                  className={styles.inputField}
                  value={editingAxis === "end" ? draftPathHeading : endHeading.toFixed(1)}
                  onFocus={() => startEditing("end")}
                  onChange={(e) => setDraftPathHeading(e.target.value)}
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
