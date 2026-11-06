"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { FIELD_BORDER_WIDTH, POINT_RADIUS } from "../plannerConstants";
import type { DragTarget, FieldSize, Point } from "../plannerTypes";
import { getPathSegments, resolvePathSegments, toFieldCoords } from "../plannerUtils";
import type { PlaybackPose } from "../playback";
import { FieldViewport } from "../../field/FieldViewport";
import { PathLayer } from "../../field/PathLayer";
import { RobotLayer } from "../../field/RobotLayer";
import { TrailLayer } from "../../field/TrailLayer";
import { followedFieldPaths, type FollowedPath } from "../../tracker/followedPaths";
import type { FieldPath, FieldPose, RobotSize } from "../../field/geometry";
import { PlannerHandles } from "./PlannerHandles";
import styles from "../page.module.css";

type FieldCanvasProps = {
  fieldRef: RefObject<HTMLDivElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  fieldImageSrc: string;
  fieldSize: FieldSize;
  points: Point[];
  hoverTarget: DragTarget | null;
  isDragging: boolean;
  hasMeasuredField: boolean;
  robotSize: RobotSize;
  playbackPose: PlaybackPose;
  isRobotOutOfBounds: boolean;
  areControlPointsHidden: boolean;
  isPointVisible: (index: number) => boolean;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
  onClick: (event: ReactMouseEvent<SVGSVGElement>) => void;
  recordingView?: { pose: FieldPose | null; robot: RobotSize; trail: FieldPose[]; showTrail: boolean; paths: FollowedPath[]; activePathId?: number; showPaths: boolean };
};

export function FieldCanvas({ fieldRef, svgRef, fieldImageSrc, fieldSize, points, hoverTarget, isDragging, hasMeasuredField, robotSize, playbackPose, isRobotOutOfBounds, areControlPointsHidden, isPointVisible, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onClick, recordingView }: FieldCanvasProps) {
  const geometry = !hasMeasuredField || recordingView ? [] : points.slice(1).flatMap((point, offset) => {
    if (point.hidden) return [];
    return [{ point, pathIndex: offset + 1, resolved: resolvePathSegments(points[offset], getPathSegments(point)) }];
  });
  const toField = (point: { x: number; y: number }) => toFieldCoords(point.x, point.y);
  const paths: FieldPath[] = geometry.map(({ point, resolved }) => ({
    id: point.id,
    color: point.color,
    curves: resolved.map((segment) => ({
      start: toField(segment.start),
      end: toField(segment.end),
      ...(segment.control1 && segment.control2 ? { control1: toField(segment.control1), control2: toField(segment.control2) } : {}),
    })),
  }));
  const viewport = { ...fieldSize, padding: POINT_RADIUS, border: FIELD_BORDER_WIDTH };

  return (
    <div className={styles.fieldWrapper}>
      <FieldViewport image={fieldImageSrc} width={fieldSize.width} height={fieldSize.height} padding={POINT_RADIUS} containerRef={fieldRef} svgRef={svgRef} className={styles.fieldContainer} imageClassName={styles.fieldImage} overlayClassName={styles.svgOverlay} overlayProps={recordingView ? { onClick } : {
        onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave, onClick,
        style: { cursor: isDragging ? "grabbing" : hoverTarget !== null ? "grab" : "default" },
      }}>
        <PathLayer paths={recordingView ? (recordingView.showPaths ? followedFieldPaths(recordingView.paths, recordingView.activePathId) : []) : paths} viewport={viewport} showEndpoints={!!recordingView} />
        {recordingView ? <>
          {recordingView.showTrail && <TrailLayer poses={recordingView.trail} viewport={viewport} />}
          {hasMeasuredField && recordingView.pose && <RobotLayer pose={recordingView.pose} size={recordingView.robot} viewport={viewport} image="/robot.png" />}
        </> : <>
          {hasMeasuredField && <RobotLayer pose={{ ...toFieldCoords(playbackPose.nx, playbackPose.ny), heading: playbackPose.heading }} size={robotSize} viewport={viewport} image="/robot.png" outOfBounds={isRobotOutOfBounds} />}
          <PlannerHandles pathGeometry={geometry} points={points} fieldSize={fieldSize} hoverTarget={hoverTarget} hasMeasuredField={hasMeasuredField} areControlPointsHidden={areControlPointsHidden} isPointVisible={isPointVisible} />
        </>}
      </FieldViewport>
    </div>
  );
}
