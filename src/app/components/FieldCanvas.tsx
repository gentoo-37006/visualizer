"use client";

import Image from "next/image";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { POINT_DIAMETER } from "../plannerConstants";
import type { DragTarget, FieldSize, Point } from "../plannerTypes";
import {
  getPathSegments,
  isSameTarget,
  isSegmentControlLockedByLinearNeighbor,
  resolvePathSegments,
  toSvgPixelCoords,
} from "../plannerUtils";
import type { PlaybackPose } from "../playback";
import styles from "../page.module.css";

type RobotSvgFrame = { x: number; y: number; width: number; height: number; centerX: number; centerY: number };

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
  isRobotOutOfBounds: boolean;
  areControlPointsHidden: boolean;
  isPointVisible: (index: number) => boolean;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
  onClick: (event: ReactMouseEvent<SVGSVGElement>) => void;
};

export function FieldCanvas({ fieldRef, svgRef, fieldImageSrc, fieldSize, points, hoverTarget, isDragging, hasMeasuredField, robotSvgFrame, playbackPose, isRobotOutOfBounds, areControlPointsHidden, isPointVisible, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onClick }: FieldCanvasProps) {
  const pathGeometry = !hasMeasuredField ? [] : points.slice(1).flatMap((point, offset) => {
    const pathIndex = offset + 1;
    if (point.hidden) return [];
    const segments = getPathSegments(point);
    return [{ point, pathIndex, resolved: resolvePathSegments(points[pathIndex - 1], segments) }];
  });

  return (
    <div className={styles.fieldWrapper}>
      <div className={styles.fieldContainer} ref={fieldRef}>
        <Image src={fieldImageSrc} alt="Field Map" fill priority unoptimized sizes="(max-width: 768px) 100vw, (max-height: 100vh) 100vh, 1000px" className={styles.fieldImage} />
        <svg ref={svgRef} className={styles.svgOverlay} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave} onClick={onClick} style={{ cursor: isDragging ? "grabbing" : (hoverTarget !== null ? "grab" : "default") }} viewBox={`0 0 ${fieldSize.width + POINT_DIAMETER} ${fieldSize.height + POINT_DIAMETER}`}>
          {pathGeometry.map(({ point, resolved }) => {
            const firstStart = resolved[0]?.start;
            if (!firstStart) return null;
            const startPixel = toSvgPixelCoords(firstStart.x, firstStart.y, fieldSize);
            const d = [`M ${startPixel.x.toFixed(2)} ${startPixel.y.toFixed(2)}`, ...resolved.map((segment) => {
              const end = toSvgPixelCoords(segment.end.x, segment.end.y, fieldSize);
              if (!segment.control1 || !segment.control2) return `L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
              const control1 = toSvgPixelCoords(segment.control1.x, segment.control1.y, fieldSize);
              const control2 = toSvgPixelCoords(segment.control2.x, segment.control2.y, fieldSize);
              return `C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)} ${control2.x.toFixed(2)} ${control2.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
            })].join(" ");
            return <path key={`path-${point.id}`} d={d} fill="none" stroke={point.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />;
          })}

          {!areControlPointsHidden && pathGeometry.map(({ point, resolved }) => (
            <g key={`control-lines-${point.id}`} pointerEvents="none">
              {resolved.map((segment) => {
                if (!segment.control1 || !segment.control2) return null;
                const start = toSvgPixelCoords(segment.start.x, segment.start.y, fieldSize);
                const control1 = toSvgPixelCoords(segment.control1.x, segment.control1.y, fieldSize);
                const control2 = toSvgPixelCoords(segment.control2.x, segment.control2.y, fieldSize);
                const end = toSvgPixelCoords(segment.end.x, segment.end.y, fieldSize);
                return <g key={`guides-${segment.segment.id}`}><line x1={start.x} y1={start.y} x2={control1.x} y2={control1.y} stroke={point.color} strokeWidth="1.5" opacity="0.9" /><line x1={control2.x} y1={control2.y} x2={end.x} y2={end.y} stroke={point.color} strokeWidth="1.5" opacity="0.9" /></g>;
              })}
            </g>
          ))}

          {hasMeasuredField && <g transform={`rotate(${playbackPose.heading} ${robotSvgFrame.centerX} ${robotSvgFrame.centerY})`}><image href="/robot.png" x={robotSvgFrame.x} y={robotSvgFrame.y} width={robotSvgFrame.width} height={robotSvgFrame.height} preserveAspectRatio="none" opacity="0.92" pointerEvents="none" />{isRobotOutOfBounds && <rect x={robotSvgFrame.x} y={robotSvgFrame.y} width={robotSvgFrame.width} height={robotSvgFrame.height} fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="2" pointerEvents="none"><title>The robot is through the field wall at this point in the path</title></rect>}</g>}

          {hasMeasuredField && points[0] && isPointVisible(0) && (() => { const { x, y } = toSvgPixelCoords(points[0].nx, points[0].ny, fieldSize); return <circle cx={x} cy={y} r={POINT_DIAMETER / 2} fill={points[0].color} />; })()}

          {pathGeometry.map(({ point, pathIndex, resolved }) => (
            <g key={`segment-markers-${point.id}`}>
              {resolved.map((segment, segmentIndex) => {
                const end = toSvgPixelCoords(segment.end.x, segment.end.y, fieldSize);
                const endpointHovered = isSameTarget(hoverTarget, { kind: "segmentEnd", pathIndex, segmentIndex }) && !point.locked;
                const control1 = segment.control1 ? toSvgPixelCoords(segment.control1.x, segment.control1.y, fieldSize) : null;
                const control2 = segment.control2 ? toSvgPixelCoords(segment.control2.x, segment.control2.y, fieldSize) : null;
                const segments = getPathSegments(point);
                const control1Locked = isSegmentControlLockedByLinearNeighbor(segments, segmentIndex, "start");
                const control2Locked = isSegmentControlLockedByLinearNeighbor(segments, segmentIndex, "end");
                const control1Hovered = isSameTarget(hoverTarget, { kind: "segmentControl", pathIndex, segmentIndex, control: "start" }) && !point.locked;
                const control2Hovered = isSameTarget(hoverTarget, { kind: "segmentControl", pathIndex, segmentIndex, control: "end" }) && !point.locked;
                return <g key={`segment-${segment.segment.id}`}>{!areControlPointsHidden && control1 && <circle cx={control1.x} cy={control1.y} r="5" fill="#262626" stroke={control1Hovered ? "white" : point.color} strokeWidth="2" opacity={control1Locked ? 0.55 : 1} />}{!areControlPointsHidden && control2 && <circle cx={control2.x} cy={control2.y} r="5" fill="#262626" stroke={control2Hovered ? "white" : point.color} strokeWidth="2" opacity={control2Locked ? 0.55 : 1} />}<circle cx={end.x} cy={end.y} r={POINT_DIAMETER / 2} fill={point.color} stroke={endpointHovered ? "white" : "transparent"} strokeWidth="2" /><text x={end.x} y={end.y} fill="#111827" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{segmentIndex + 1}</text></g>;
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
