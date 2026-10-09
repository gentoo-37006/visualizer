import { describe, expect, it } from "vitest";
import { fieldToViewport, robotFrame } from "./geometry";

const viewport = { width: 1000, height: 1000, border: 3, padding: 10 };

describe("shared field coordinates", () => {
  it("maps the center and field corners with the planner's border and handle padding", () => {
    expect(fieldToViewport({ x: 0, y: 0 }, viewport)).toEqual({ x: 510, y: 510 });
    expect(fieldToViewport({ x: -72, y: 72 }, viewport)).toEqual({ x: 13, y: 13 });
    expect(fieldToViewport({ x: 72, y: -72 }, viewport)).toEqual({ x: 1007, y: 1007 });
  });

  it("keeps a non-square robot centered and preserves off-field positions", () => {
    const frame = robotFrame({ x: 90, y: 0, heading: 90 }, { width: 16, length: 18 }, viewport);
    expect(frame.centerX).toBeGreaterThan(1007);
    expect(frame.centerY).toBe(510);
    expect(frame.height / frame.width).toBeCloseTo(18 / 16);
  });
});
