import { ControlMarker, PointMarker, SplineGuides } from "../../field/PointMarker";
import type { DragTarget, FieldSize, Point } from "../plannerTypes";
import { getPathSegments, isSameTarget, isSegmentControlLockedByLinearNeighbor, resolvePathSegments, toSvgPixelCoords } from "../plannerUtils";

type Props = {
  pathGeometry: { point: Point; pathIndex: number; resolved: ReturnType<typeof resolvePathSegments> }[];
  points: Point[];
  fieldSize: FieldSize;
  hoverTarget: DragTarget | null;
  hasMeasuredField: boolean;
  areControlPointsHidden: boolean;
  isPointVisible: (index: number) => boolean;
};

export function PlannerHandles({ pathGeometry, points, fieldSize, hoverTarget, hasMeasuredField, areControlPointsHidden, isPointVisible }: Props) {
  return <g data-layer="planner-handles">
          {!areControlPointsHidden && pathGeometry.map(({ point, resolved }) => (
            <g key={`control-lines-${point.id}`} pointerEvents="none">
              {resolved.map((segment) => {
                if (!segment.control1 || !segment.control2) return null;
                const start = toSvgPixelCoords(segment.start.x, segment.start.y, fieldSize);
                const control1 = toSvgPixelCoords(segment.control1.x, segment.control1.y, fieldSize);
                const control2 = toSvgPixelCoords(segment.control2.x, segment.control2.y, fieldSize);
                const end = toSvgPixelCoords(segment.end.x, segment.end.y, fieldSize);
                return <SplineGuides key={`guides-${segment.segment.id}`} start={start} end={end} control1={control1} control2={control2} color={point.color} />;
              })}
            </g>
          ))}

          {hasMeasuredField && points[0] && isPointVisible(0) && (() => { const { x, y } = toSvgPixelCoords(points[0].nx, points[0].ny, fieldSize); return <PointMarker x={x} y={y} color={points[0].color} />; })()}

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
                return <g key={`segment-${segment.segment.id}`}>{!areControlPointsHidden && control1 && <ControlMarker x={control1.x} y={control1.y} color={point.color} hovered={control1Hovered} locked={control1Locked} />}{!areControlPointsHidden && control2 && <ControlMarker x={control2.x} y={control2.y} color={point.color} hovered={control2Hovered} locked={control2Locked} />}<PointMarker x={end.x} y={end.y} color={point.color} hovered={endpointHovered} label={segmentIndex + 1} /></g>;
              })}
            </g>
          ))}
  </g>;
}
