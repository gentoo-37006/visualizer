"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { PointCard } from "./components/PointCard";
import { serializePathPlannerKotlin, parsePathPlannerKotlin } from "./kotlinAutonFile";
import {
  CONTROL_POINT_RADIUS,
  FIELD_BORDER_WIDTH,
  INITIAL_POINT_COLOR,
  INITIAL_POINT_ID,
  POINT_DIAMETER,
  POINT_RADIUS,
} from "./plannerConstants";
import type { DragTarget, FieldSize, HeadingInterpolation, PathHeadingField, Point } from "./plannerTypes";
import {
  controlPointHitRadius,
  createDefaultHeadingValues,
  createSplinePath,
  generateId,
  isSameTarget,
  mainPointHitRadius,
  normalizeHeading,
  randomColor,
  targetPathIndex,
  toFieldCoords,
  toNormalizedCoords,
  toSvgPixelCoords,
} from "./plannerUtils";
import styles from "./page.module.css";

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
  const isPointVisible = (index: number) => {
    const previousSegmentVisible = index > 0 && !points[index].hidden;
    const nextSegmentVisible = index < points.length - 1 && !points[index + 1].hidden;
    return previousSegmentVisible || nextSegmentVisible || points.length === 1;
  };

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
        hidden: false,
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
    if (points[index].hidden) return;

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

  const handleToggleHidden = (index: number) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, hidden: !point.hidden } : point
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
    const num = parseFloat(value);
    if (isNaN(num)) return;

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

  const handleImportKotlin = async (event: ChangeEvent<HTMLInputElement>) => {
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

  const getPointerNormalized = (e: ReactPointerEvent<SVGSVGElement> | globalThis.PointerEvent) => {
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

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pathIndex = targetPathIndex(hoverTarget);
    if (
      hoverTarget !== null &&
      pathIndex !== null &&
      !points[pathIndex].locked &&
      isPointVisible(pathIndex)
    ) {
      setIsDragging(true);
      setActiveTarget(hoverTarget);
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isDragging && activeTarget !== null) {
      const { nx, ny } = getPointerNormalized(e);
      updateTargetPosition(activeTarget, nx, ny);
      return;
    }

    if (!svgRef.current) return;
    const { nx, ny } = getPointerNormalized(e);
    const minFieldSize = Math.min(
      fieldSize.width - FIELD_BORDER_WIDTH * 2,
      fieldSize.height - FIELD_BORDER_WIDTH * 2
    );
    if (minFieldSize <= 0) return;

    let hit: DragTarget | null = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].locked) continue;
      const controlPoints = points[i].controlPoints ?? [];
      if (!points[i].hidden) {
        for (let j = controlPoints.length - 1; j >= 0; j--) {
          const dx = controlPoints[j].nx - nx;
          const dy = controlPoints[j].ny - ny;
          if (Math.sqrt(dx * dx + dy * dy) <= controlPointHitRadius(minFieldSize)) {
            hit = { kind: "control", pathIndex: i, controlIndex: j };
            break;
          }
        }
      }
      if (hit) break;
      if (!isPointVisible(i)) continue;

      const dx = points[i].nx - nx;
      const dy = points[i].ny - ny;
      if (Math.sqrt(dx * dx + dy * dy) <= mainPointHitRadius(minFieldSize)) {
        hit = { kind: "point", index: i };
        break;
      }
    }
    setHoverTarget(hit);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
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
            style={{ cursor: isDragging ? "grabbing" : (hoverTarget !== null ? "pointer" : "default") }}
            viewBox={`0 0 ${fieldSize.width + POINT_DIAMETER} ${fieldSize.height + POINT_DIAMETER}`}
          >
            {hasMeasuredField && points.map((p, i) => {
              if (i === points.length - 1) return null;
              const nextP = points[i + 1];
              if (nextP.hidden) return null;
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

            {hasMeasuredField && points.map((p, i) => {
              if (!isPointVisible(i)) return null;
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

            {hasMeasuredField && points.map((p, i) =>
              p.hidden ? null : (p.controlPoints ?? []).map((controlPoint, j) => {
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
                name={p.name ?? `path${i}`}
                color={p.color}
                locked={p.locked}
                hidden={Boolean(p.hidden)}
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
                onToggleHidden={() => handleToggleHidden(i)}
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
