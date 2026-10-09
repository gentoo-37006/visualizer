import { POINT_DIAMETER } from "../plannerConstants";
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
                return <g key={`guides-${segment.segment.id}`}><line x1={start.x} y1={start.y} x2={control1.x} y2={control1.y} stroke={point.color} strokeWidth="1.5" opacity="0.9" /><line x1={control2.x} y1={control2.y} x2={end.x} y2={end.y} stroke={point.color} strokeWidth="1.5" opacity="0.9" /></g>;
              })}
            </g>
          ))}

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
  </g>;
}
