import { fieldToViewport, type FieldPath, type ViewportGeometry } from "./geometry";

export function PathLayer({ paths, viewport, showEndpoints = false }: { paths: FieldPath[]; viewport: ViewportGeometry; showEndpoints?: boolean }) {
  return <g data-layer="paths" pointerEvents="none">{paths.map((path) => {
    const first = path.curves[0];
    if (!first) return null;
    const start = fieldToViewport(first.start, viewport);
    const d = [`M ${start.x} ${start.y}`, ...path.curves.map((curve) => {
      const end = fieldToViewport(curve.end, viewport);
      if (!curve.control1 || !curve.control2) return `L ${end.x} ${end.y}`;
      const c1 = fieldToViewport(curve.control1, viewport);
      const c2 = fieldToViewport(curve.control2, viewport);
      return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    })].join(" ");
    return <g key={path.id} data-path-id={path.id} opacity={path.opacity ?? 1}>
      <path d={d} fill="none" stroke={path.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {showEndpoints && [first.start, path.curves[path.curves.length - 1].end].map((point, index) => {
        const position = fieldToViewport(point, viewport);
        return <circle key={index} cx={position.x} cy={position.y} r={4} fill={path.color} />;
      })}
    </g>;
  })}</g>;
}
