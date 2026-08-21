import { describe, expect, it } from "vitest";
import {
  isKotlinIdentifierDraft,
  isNumericDraft,
  nextPointPlacement,
  normalizeHeading,
  toFieldCoords,
  toNormalizedCoords,
} from "../plannerUtils";
import { FIELD_SIZE_INCHES } from "../plannerConstants";

describe("field coordinates", () => {
  it("round trips inches through the normalised form", () => {
    for (const [x, y] of [
      [0, 0],
      [24, -36],
      [-60, 60],
      [71.5, -71.5],
    ]) {
      const { nx, ny } = toNormalizedCoords(x, y);
      const back = toFieldCoords(nx, ny);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });

  it("puts the origin at the centre of the field", () => {
    expect(toNormalizedCoords(0, 0)).toEqual({ nx: 0.5, ny: 0.5 });
    expect(toFieldCoords(0.5, 0.5)).toEqual({ x: 0, y: 0 });
  });

  it("orients +x right and +y up", () => {
    const half = FIELD_SIZE_INCHES / 2;
    expect(toNormalizedCoords(half, 0).nx).toBe(1);
    expect(toNormalizedCoords(0, half).ny).toBe(0);
  });

  it("clamps positions outside the field to its edges", () => {
    expect(toNormalizedCoords(500, -500)).toEqual({ nx: 1, ny: 1 });
    expect(toNormalizedCoords(-500, 500)).toEqual({ nx: 0, ny: 0 });
  });
});

describe("normalizeHeading", () => {
  it("wraps into a single turn", () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(90)).toBe(90);
    expect(normalizeHeading(-90)).toBe(-90);
    expect(normalizeHeading(450)).toBe(90);
    expect(normalizeHeading(-450)).toBe(-90);
    expect(normalizeHeading(720)).toBe(0);
  });

  it("keeps a half turn on the side it came from", () => {
    expect(normalizeHeading(180)).toBe(180);
    expect(normalizeHeading(-180)).toBe(-180);
  });

  it("is idempotent", () => {
    for (const heading of [0, 37, -37, 180, -180, 359, -359, 1000]) {
      expect(normalizeHeading(normalizeHeading(heading))).toBe(normalizeHeading(heading));
    }
  });
});

describe("input drafts", () => {
  it("accepts partially typed numbers so fields stay editable", () => {
    for (const draft of ["", "-", "1", "1.", "-0.", ".5", "12.25"]) {
      expect(isNumericDraft(draft), draft).toBe(true);
    }
    for (const draft of ["abc", "1.2.3", "1e5", "- 1", "1-"]) {
      expect(isNumericDraft(draft), draft).toBe(false);
    }
  });

  it("only accepts names that can become kotlin identifiers", () => {
    for (const draft of ["", "A", "INTAKE", "_lift", "drop2"]) {
      expect(isKotlinIdentifierDraft(draft), draft).toBe(true);
    }
    for (const draft of ["2fast", "has space", "has-dash", "trail!"]) {
      expect(isKotlinIdentifierDraft(draft), draft).toBe(false);
    }
  });
});

describe("nextPointPlacement", () => {
  it("never lands on the point it follows", () => {
    const placement = nextPointPlacement([{ nx: 0.5, ny: 0.5 }]);
    expect(Math.hypot(placement.nx - 0.5, placement.ny - 0.5)).toBeGreaterThan(0.01);
  });

  it("keeps travelling the way the previous segment went", () => {
    const placement = nextPointPlacement([
      { nx: 0.5, ny: 0.5 },
      { nx: 0.5, ny: 0.3 },
    ]);
    expect(placement.nx).toBeCloseTo(0.5, 6);
    expect(placement.ny).toBeLessThan(0.3);
  });

  it("turns away from the wall instead of stacking against it", () => {
    const placement = nextPointPlacement([
      { nx: 0.5, ny: 0.2 },
      { nx: 0.5, ny: 0.02 },
    ]);
    expect(placement.ny).toBeGreaterThanOrEqual(0.02);
    expect(Math.hypot(placement.nx - 0.5, placement.ny - 0.02)).toBeGreaterThan(0.01);
  });

  it("stays inside the field from every corner", () => {
    for (const corner of [
      { nx: 0, ny: 0 },
      { nx: 1, ny: 0 },
      { nx: 0, ny: 1 },
      { nx: 1, ny: 1 },
    ]) {
      const placement = nextPointPlacement([corner]);
      expect(placement.nx).toBeGreaterThanOrEqual(0);
      expect(placement.nx).toBeLessThanOrEqual(1);
      expect(placement.ny).toBeGreaterThanOrEqual(0);
      expect(placement.ny).toBeLessThanOrEqual(1);
      expect(Math.hypot(placement.nx - corner.nx, placement.ny - corner.ny)).toBeGreaterThan(0.01);
    }
  });
});
