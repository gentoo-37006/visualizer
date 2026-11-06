import { fieldToViewport, type FieldPath, type ViewportGeometry } from "./geometry";
import { INITIAL_POINT_COLOR } from "../app/plannerConstants";
import { PointMarker } from "./PointMarker";

export function PathLayer({ paths, viewport, showEndpoints = false }: { paths: FieldPath[]; viewport: ViewportGeometry; showEndpoints?: boolean }) {
  return <g data-layer="paths" pointerEvents="none">{paths.map((path, pathIndex) => {
    const first = path.curves[0];
    if (!first) return null;
    const start = fieldToViewport(first.start, viewport);
    const end = fieldToViewport(path.curves[path.curves.length - 1].end, viewport);
    const d = [`M ${start.x} ${start.y}`, ...path.curves.map((curve) => {
      const end = fieldToViewport(curve.end, viewport);
      if (!curve.control1 || !curve.control2) return `L ${end.x} ${end.y}`;
      const c1 = fieldToViewport(curve.control1, viewport);
      const c2 = fieldToViewport(curve.control2, viewport);
      return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    })].join(" ");
    return <g key={path.id} data-path-id={path.id}>
      <path d={d} fill="none" stroke={path.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {showEndpoints && pathIndex === 0 && <PointMarker x={start.x} y={start.y} color={INITIAL_POINT_COLOR} />}
      {showEndpoints && <PointMarker x={end.x} y={end.y} color={path.color} />}
    </g>;
  })}</g>;
}
