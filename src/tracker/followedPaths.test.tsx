import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseFollowedPath, parsePathProgress } from "./followedPaths";
import { FollowedPathsLayer } from "./FollowedPathsLayer";

const path = { id: 1, points: [{ x: 0, y: 0 }, { x: 24, y: 24 }] };
describe("followed paths", () => {
  it("validates bounded geometry before rendering", () => {
    expect(parseFollowedPath(path)).toEqual(path);
    for (const bad of [null, { ...path, id: 0.5 }, { ...path, points: [] }, { ...path, points: [{ x: NaN, y: 0 }, path.points[1]] }, { ...path, points: Array(130).fill(path.points[0]) }]) {
      expect(parseFollowedPath(bad)).toBeNull();
    }
  });
  it("reads motionPath progress safely", () => {
    expect(parsePathProgress({ id: 1, t: 0.25 })).toEqual({ id: 1, t: 0.25 });
    expect(parsePathProgress({ id: 1, t: 2 })?.t).toBe(1);
    expect(parsePathProgress({ id: 1, t: NaN })).toBeNull();
    expect(parsePathProgress(null)).toBeNull();
  });
  it("draws endpoints and emphasizes only the active path", () => {
    const html = renderToStaticMarkup(<FollowedPathsLayer paths={[path, { ...path, id: 2 }]} activeId={2} viewport={{ width: 144, height: 144, padding: 0, border: 0 }} />);
    expect(html).toContain('data-path-id="1" opacity="0.5"');
    expect(html).toContain('data-path-id="2" opacity="1"');
    const coordinates = html.match(/d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/)!;
    expect(coordinates.slice(1).map(Number)).toEqual([72, 72, 96, expect.closeTo(48)]);
    expect(html.match(/<circle/g)).toHaveLength(4);
  });
});
