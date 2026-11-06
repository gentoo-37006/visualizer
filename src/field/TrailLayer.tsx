import { fieldToViewport, type FieldPosition, type ViewportGeometry } from "./geometry";

export function TrailLayer({ poses, viewport }: { poses: FieldPosition[]; viewport: ViewportGeometry }) {
  const points = poses.map((pose) => {
    const point = fieldToViewport(pose, viewport);
    return `${point.x},${point.y}`;
  }).join(" ");
  return <g data-layer="trail" fill="none" strokeWidth="3" strokeLinejoin="round" pointerEvents="none">
    <polyline points={points} stroke="#000000" strokeLinecap="round" />
    <polyline points={points} stroke="#ffffff" strokeDasharray="8 8" strokeLinecap="butt" />
  </g>;
}
