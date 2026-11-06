import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { followedFieldPaths, parseFollowedPath, parsePathProgress } from "./followedPaths";
import { PathLayer } from "../field/PathLayer";
import { INITIAL_POINT_COLOR, POINT_RADIUS } from "../app/plannerConstants";

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
  it("matches planner marker sizes, start color, and full opacity without labels", () => {
    const html = renderToStaticMarkup(<PathLayer paths={followedFieldPaths([path, { ...path, id: 2 }])} showEndpoints viewport={{ width: 144, height: 144, padding: 0, border: 0 }} />);
    expect(html).not.toContain('opacity=');
    expect(html).toContain(`fill="${INITIAL_POINT_COLOR}"`);
    const coordinates = html.match(/d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/)!;
    expect(coordinates.slice(1).map(Number)).toEqual([72, 72, 96, expect.closeTo(48)]);
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html.match(new RegExp(`r="${POINT_RADIUS}"`, "g"))).toHaveLength(3);
    expect(html).not.toContain('<text');
  });
  it("preserves exact splines but shows only outer endpoints without controls or labels", () => {
    const curves = [
      { start: { x: 0, y: 0 }, control1: { x: 0, y: 24 }, control2: { x: 24, y: 24 }, end: { x: 24, y: 0 } },
      { start: { x: 24, y: 0 }, end: { x: 36, y: 0 } },
    ];
    const parsed = parseFollowedPath({ ...path, curves })!;
    expect(parsed.curves).toEqual(curves);
    const html = renderToStaticMarkup(<PathLayer paths={followedFieldPaths([parsed])} showEndpoints viewport={{ width: 144, height: 144, padding: 0, border: 0 }} />);
    expect(html).toContain(' C ');
    expect(html).not.toContain('<text');
    expect(html.match(/<circle/g)).toHaveLength(2);
    expect(html).not.toContain('<line');
    expect(parseFollowedPath({ ...path, curves: [{ ...curves[0], control2: null }] })).toBeNull();
  });
});
