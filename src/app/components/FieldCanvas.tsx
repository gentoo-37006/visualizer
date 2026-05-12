"use client";

import Image from "next/image";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { POINT_DIAMETER } from "../plannerConstants";
import type { DragTarget, FieldSize, Point } from "../plannerTypes";
import { createSplinePath, isSameTarget, toSvgPixelCoords } from "../plannerUtils";
import type { PlaybackPose } from "../playback";
import styles from "../page.module.css";

type RobotSvgFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type FieldCanvasProps = {
  fieldRef: RefObject<HTMLDivElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  fieldImageSrc: string;
  fieldSize: FieldSize;
  points: Point[];
  hoverTarget: DragTarget | null;
  isDragging: boolean;
  hasMeasuredField: boolean;
  robotSvgFrame: RobotSvgFrame;
  playbackPose: PlaybackPose;
  isPointVisible: (index: number) => boolean;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
  onDoubleClick: (event: ReactMouseEvent<SVGSVGElement>) => void;
};

export function FieldCanvas({
  fieldRef,
  svgRef,
  fieldImageSrc,
  fieldSize,
  points,
  hoverTarget,
  isDragging,
  hasMeasuredField,
  robotSvgFrame,
  playbackPose,
  isPointVisible,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onDoubleClick,
}: FieldCanvasProps) {
  return (
    <div className={styles.fieldWrapper}>
      <div className={styles.fieldContainer} ref={fieldRef}>
        <Image
          src={fieldImageSrc}
          alt="Field Map"
          fill
          priority
          unoptimized={fieldImageSrc.startsWith("data:")}
          sizes="(max-width: 768px) 100vw, (max-height: 100vh) 100vh, 1000px"
          className={styles.fieldImage}
        />
        <svg
          ref={svgRef}
          className={styles.svgOverlay}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onDoubleClick={onDoubleClick}
          style={{ cursor: isDragging ? "grabbing" : (hoverTarget !== null ? "grab" : "default") }}
          viewBox={`0 0 ${fieldSize.width + POINT_DIAMETER} ${fieldSize.height + POINT_DIAMETER}`}
        >
          {hasMeasuredField && points.map((point, index) => {
            if (index === points.length - 1) return null;
            const nextPoint = points[index + 1];
            if (nextPoint.hidden) return null;
            const start = toSvgPixelCoords(point.nx, point.ny, fieldSize);
            const end = toSvgPixelCoords(nextPoint.nx, nextPoint.ny, fieldSize);
            const controlPoints = (nextPoint.controlPoints ?? []).map((controlPoint) =>
              toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize)
            );

            if (controlPoints.length > 0) {
              return (
                <path
                  key={`line-${point.id}`}
                  d={createSplinePath(start, controlPoints, end)}
                  fill="none"
                  stroke={nextPoint.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }

            return (
              <line
                key={`line-${point.id}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={nextPoint.color}
                strokeWidth="6"
                strokeLinecap="round"
              />
            );
          })}

          {hasMeasuredField && points.map((point, index) => {
            if (!isPointVisible(index)) return null;
            const { x, y } = toSvgPixelCoords(point.nx, point.ny, fieldSize);
            const isHovered = isSameTarget(hoverTarget, { kind: "point", index }) && !point.locked;

            return (
              <g key={`point-${point.id}`}>
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
                  fill={point.color}
                  stroke={isHovered ? "white" : "transparent"}
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {hasMeasuredField && points.map((point, index) =>
            point.hidden ? null : (point.controlPoints ?? []).map((controlPoint, controlIndex) => {
              const { x, y } = toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize);
              const isHovered =
                isSameTarget(hoverTarget, { kind: "control", pathIndex: index, controlIndex }) && !point.locked;

              return (
                <g key={`control-${controlPoint.id}`}>
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
                    fill={point.color}
                    stroke={isHovered ? "white" : "transparent"}
                    strokeWidth="2"
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
                    {controlIndex + 1}
                  </text>
                </g>
              );
            })
          )}
          {hasMeasuredField && (
            <image
              href="/robot.png"
              x={robotSvgFrame.x}
              y={robotSvgFrame.y}
              width={robotSvgFrame.width}
              height={robotSvgFrame.height}
              preserveAspectRatio="none"
              transform={`rotate(${playbackPose.heading} ${robotSvgFrame.centerX} ${robotSvgFrame.centerY})`}
              opacity="0.92"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
