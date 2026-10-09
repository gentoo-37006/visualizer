import { fieldToViewport, type FieldPosition, type ViewportGeometry } from "./geometry";

export function TrailLayer({ poses, viewport }: { poses: FieldPosition[]; viewport: ViewportGeometry }) {
  const points = poses.map((pose) => {
    const point = fieldToViewport(pose, viewport);
    return `${point.x},${point.y}`;
  }).join(" ");
  return <polyline data-layer="trail" points={points} fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
}
