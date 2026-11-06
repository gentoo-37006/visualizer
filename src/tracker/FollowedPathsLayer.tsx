import { PathLayer } from "../field/PathLayer";
import { fieldToViewport, type ViewportGeometry } from "../field/geometry";
import { seededColor } from "../app/plannerColors";
import type { FollowedPath } from "./followedPaths";

export function FollowedPathsLayer({ paths, activeId, viewport }: { paths: FollowedPath[]; activeId?: number; viewport: ViewportGeometry }) {
  return <g data-layer="followed-paths" pointerEvents="none">{paths.map((path, index) => {
    const color = seededColor(String(path.id));
    const curves = path.points.slice(1).map((end, i) => ({ start: path.points[i], end }));
    return <g key={`${path.id}-${index}`} data-path-id={path.id} opacity={activeId === path.id ? 1 : 0.5}>
      <PathLayer paths={[{ id: String(path.id), color, curves }]} viewport={viewport} />
      {[path.points[0], path.points.at(-1)!].map((point, i) => {
        const position = fieldToViewport(point, viewport);
        return <circle key={i} cx={position.x} cy={position.y} r={4} fill={color} />;
      })}
    </g>;
  })}</g>;
}
