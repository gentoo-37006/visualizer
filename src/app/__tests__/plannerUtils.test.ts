import { describe, expect, it } from "vitest";
import {
  appendCubicPathJoin,
  createForwardPathSegment,
  createCubicSplineSegments,
  createSplinePath,
  evaluateCubicSplineSegment,
  isKotlinIdentifierDraft,
  isNumericDraft,
  mirrorAutonPoints,
  normalizeHeading,
  resolvePathSegments,
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

describe("cubic pathchains", () => {
  it("creates one cubic segment between each pair of anchors", () => {
    const knots = [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 5, y: 1 },
      { x: 8, y: 4 },
    ];
    const segments = createCubicSplineSegments(knots);

    expect(segments).toHaveLength(3);
    expect(segments[0].start).toEqual(knots[0]);
    expect(segments[0].end).toEqual(knots[1]);
    expect(segments[1].start).toEqual(knots[1]);
    expect(segments[2].end).toEqual(knots[3]);
  });

  it("keeps a join directly on both neighboring cubic segments", () => {
    const segments = createCubicSplineSegments([
      { x: 0, y: 0 },
      { x: 3, y: 4, controlOffsetX: 1.5, controlOffsetY: -0.5 },
      { x: 8, y: 1 },
    ]);

    expect(evaluateCubicSplineSegment(segments[0], 1)).toEqual({ x: 3, y: 4 });
    expect(evaluateCubicSplineSegment(segments[1], 0)).toEqual({ x: 3, y: 4 });
    expect({
      x: 3 - segments[0].control2.x,
      y: 4 - segments[0].control2.y,
    }).toEqual({
      x: segments[1].control1.x - 3,
      y: segments[1].control1.y - 4,
    });
  });

  it("renders even a straight path as a cubic segment", () => {
    expect(createSplinePath({ x: 0, y: 0 }, [], { x: 6, y: 3 })).toBe(
      "M 0.00 0.00 C 2.00 1.00 4.00 2.00 6.00 3.00"
    );
  });

  it("adds an anchor on the final cubic segment", () => {
    const joins = appendCubicPathJoin(
      { nx: 0, ny: 0 },
      [{ id: "join-1", nx: 0.25, ny: 0.75 }],
      { nx: 1, ny: 0 },
      "join-2"
    );

    expect(joins).toHaveLength(2);
    expect(joins[0]).toEqual({ id: "join-1", nx: 0.25, ny: 0.75 });
    expect(joins[1].id).toBe("join-2");
  });
});

describe("mixed path segments", () => {
  it("creates a straight 24-inch segment in the previous tangent direction", () => {
    const segment = createForwardPathSegment(
      { nx: 0.5, ny: 0.5 },
      { x: 3, y: 4 },
      "spline",
      "new"
    );

    expect(segment.nx).toBeCloseTo(0.6, 10);
    expect(segment.ny).toBeCloseTo(0.5 + 2 / 15, 10);
    expect(segment.startControlOffsetNx).toBeCloseTo((segment.nx - 0.5) / 3, 10);
    expect(segment.startControlOffsetNy).toBeCloseTo((segment.ny - 0.5) / 3, 10);
    expect(segment.endControlOffsetNx).toBeCloseTo(segment.startControlOffsetNx!, 10);
    expect(segment.endControlOffsetNy).toBeCloseTo(segment.startControlOffsetNy!, 10);
  });

  it("shortens a new segment instead of extending it beyond the field", () => {
    const segment = createForwardPathSegment(
      { nx: 0.95, ny: 0.5 },
      { x: 1, y: 0 },
      "spline",
      "new",
      { x: 0.2, y: 0 }
    );

    expect(segment.nx).toBe(1);
    expect(segment.ny).toBe(0.5);
    expect(segment.startControlOffsetNx).toBeCloseTo(0.05, 10);
    expect(segment.endControlOffsetNx).toBeCloseTo(0.05 / 3, 10);
  });

  it("uses the previous spline's control when both sides define a join tangent", () => {
    const resolved = resolvePathSegments(
      { nx: 0, ny: 0 },
      [
        {
          id: "previous",
          nx: 0.4,
          ny: 0.4,
          pathGeometry: "spline",
          endControlOffsetNx: 0.1,
          endControlOffsetNy: -0.05,
        },
        {
          id: "new",
          nx: 0.8,
          ny: 0.6,
          pathGeometry: "spline",
          startControlOffsetNx: -0.3,
          startControlOffsetNy: 0.2,
        },
      ]
    );

    expect(resolved[0].control2?.x).toBeCloseTo(0.3, 10);
    expect(resolved[0].control2?.y).toBeCloseTo(0.45, 10);
    expect(resolved[1].control1?.x).toBeCloseTo(0.5, 10);
    expect(resolved[1].control1?.y).toBeCloseTo(0.35, 10);
  });

  it("locks a spline's joining control to the exact tangent of a preceding line", () => {
    const resolved = resolvePathSegments(
      { nx: 0, ny: 0 },
      [
        { id: "line", nx: 0.6, ny: 0.3, pathGeometry: "linear" },
        {
          id: "spline",
          nx: 0.9,
          ny: 0.8,
          pathGeometry: "spline",
          startControlOffsetNx: -0.4,
          startControlOffsetNy: 0.5,
        },
      ]
    );

    expect(resolved[1].control1?.x).toBeCloseTo(0.8, 10);
    expect(resolved[1].control1?.y).toBeCloseTo(0.4, 10);
  });

  it("locks a spline's ending control to the exact tangent of a following line", () => {
    const resolved = resolvePathSegments(
      { nx: 0, ny: 0 },
      [
        { id: "spline", nx: 0.3, ny: 0.6, pathGeometry: "spline" },
        { id: "line", nx: 0.9, ny: 0.3, pathGeometry: "linear" },
      ]
    );

    expect(resolved[0].control2?.x).toBeCloseTo(0.1, 10);
    expect(resolved[0].control2?.y).toBeCloseTo(0.7, 10);
  });
});

describe("mirrorAutonPoints", () => {
  it("rotates every position, control and explicit heading by 180 degrees", () => {
    const points = [
      {
        id: "start",
        nx: 0.2,
        ny: 0.3,
        color: "#fff",
        locked: true,
        heading: 30,
        poseName: "BLUE_START",
      },
      {
        id: "path",
        name: "score",
        nx: 0.75,
        ny: 0.8,
        color: "#0ff",
        locked: false,
        headingMode: "linear" as const,
        constantHeading: 45,
        startHeading: -170,
        endHeading: 90,
        linearStartT: 0.2,
        linearEndT: 0.7,
        tangentReversed: true,
        poseName: "SCORE",
        startControlOffsetNx: 0.04,
        startControlOffsetNy: -0.03,
        endControlOffsetNx: -0.02,
        endControlOffsetNy: 0.05,
        controlPoints: [
          {
            id: "control",
            nx: 0.1,
            ny: 0.6,
            poseName: "CONTROL",
            startControlOffsetNx: 0.08,
            startControlOffsetNy: -0.06,
            endControlOffsetNx: -0.07,
            endControlOffsetNy: 0.09,
          },
        ],
      },
    ];

    const mirrored = mirrorAutonPoints(points);

    expect(mirrored[0]).toMatchObject({ nx: 0.8, ny: 0.7, heading: -150 });
    expect(mirrored[1]).toMatchObject({
      nx: 0.25,
      headingMode: "linear",
      constantHeading: -135,
      startHeading: 10,
      endHeading: -90,
      linearStartT: 0.2,
      linearEndT: 0.7,
      tangentReversed: true,
    });
    expect(mirrored[1].ny).toBeCloseTo(0.2, 10);
    expect(mirrored[1]).toMatchObject({
      startControlOffsetNx: -0.04,
      startControlOffsetNy: 0.03,
      endControlOffsetNx: 0.02,
      endControlOffsetNy: -0.05,
    });
    expect(mirrored[1].controlPoints?.[0]).toEqual({
      id: "control",
      nx: 0.9,
      ny: 0.4,
      startControlOffsetNx: -0.08,
      startControlOffsetNy: 0.06,
      endControlOffsetNx: 0.07,
      endControlOffsetNy: -0.09,
    });
    expect(mirrored[0]).not.toHaveProperty("poseName");
    expect(mirrored[1]).not.toHaveProperty("poseName");
  });

  it("does not mutate the current auton", () => {
    const points = [
      { id: "start", nx: 0.2, ny: 0.3, color: "#fff", locked: true, heading: 30 },
    ];

    mirrorAutonPoints(points);

    expect(points[0]).toMatchObject({ nx: 0.2, ny: 0.3, heading: 30 });
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
