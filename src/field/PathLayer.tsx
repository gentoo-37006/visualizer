import { fieldToViewport, type FieldPath, type ViewportGeometry } from "./geometry";

export function PathLayer({ paths, viewport }: { paths: FieldPath[]; viewport: ViewportGeometry }) {
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
    return <path key={path.id} d={d} fill="none" stroke={path.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />;
  })}</g>;
}
