import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROBOT_CONSTANTS,
  parsePathPlannerKotlin,
  parseRobotConstantsKotlin,
  parseSavedPosesKotlin,
  serializePathPlannerKotlin,
  type SavedPose,
} from "../kotlinAutonFile";

/**
 * Exports are the product this tool exists to produce, and teams re-import them
 * to keep editing. Anything the exporter can write, the parser has to read back
 * into the same auton, or a round trip quietly rewrites a team's auton.
 */
const roundTrip = (source: string, savedPoses: SavedPose[] = []) => {
  const parsed = parsePathPlannerKotlin(source, savedPoses);
  expect(parsed, "source should parse").not.toBeNull();
  return serializePathPlannerKotlin(parsed!.points, savedPoses, parsed!.sequenceItems, {
    alliance: parsed!.alliance,
  });
};

describe("path planner kotlin round trip", () => {
  it("preserves mixed segments, headings, triggers and sequence order", () => {
    const source = `val toBasket = Path(
    Spline(
        Pose(-60.0, -36.0),
        Pose(-48.0, -28.0),
        Pose(-36.0, -24.0),
        Pose(-24.0, -12.0),
    ),
    Linear(
        Pose(-24.0, -12.0),
        Pose(12.0, 24.0),
    ),
).constantHeading(45.0)

val toSub = Path(
    Spline(
        Pose(12.0, 24.0),
        Pose(24.0, 28.0),
        Pose(36.0, 32.0),
        Pose(48.0, 36.0),
    ),
).linearHeading(45.0, -90.0, 0.2, 0.8)

val park = Path(
    Spline(
        Pose(48.0, 36.0),
        Pose(52.0, 4.0),
        Pose(56.0, -28.0),
        Pose(60.0, -60.0),
    ),
).reversedTangentHeading()

autonSequence(Alliance.RED)
    .path(
        toBasket
            .submitAt(0.3, Actions.INTAKE)
            .removeAt(0.9, Actions.INTAKE)
    )
    .run(Actions.DEPOSIT, 1.5)
    .path(toSub)
    .submit(Actions.LIFT)
    .path(park)
    .remove(Actions.LIFT)`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps tangential headings distinct from their reversed form", () => {
    const source = `val forward = Path(
    Spline(
        Pose(0.0, 0.0),
        Pose(8.0, 0.0),
        Pose(16.0, 0.0),
        Pose(24.0, 0.0),
    ),
).tangentHeading()

autonSequence(Alliance.BLUE)
    .path(forward)`;

    expect(roundTrip(source)).toBe(source);
    expect(roundTrip(source)).not.toContain("reversedTangentHeading");
  });

  it("omits the linear t-range when it spans the whole path", () => {
    const source = `val sweep = Path(
    Spline(
        Pose(0.0, 0.0),
        Pose(8.0, 8.0),
        Pose(16.0, 16.0),
        Pose(24.0, 24.0),
    ),
).linearHeading(0.0, 90.0)

autonSequence(Alliance.BLUE)
    .path(sweep)`;

    expect(roundTrip(source)).toBe(source);
  });

  it("round trips named start poses instead of inlining their coordinates", () => {
    const savedPoses: SavedPose[] = [{ name: "BASKET", x: -60, y: -60, heading: 45 }];
    const source = `val leave = Path(
    Spline(
        Poses.START_BASKET,
        Pose(-40.0, -40.0),
        Pose(-20.0, -20.0),
        Pose(0.0, 0.0),
    ),
).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(leave)`;

    expect(roundTrip(source, savedPoses)).toBe(source);
  });

  it("rejects kotlin that is not an auton export", () => {
    expect(parsePathPlannerKotlin("class Robot { fun main() {} }", [])).toBeNull();
    expect(parsePathPlannerKotlin("", [])).toBeNull();
  });

  it("does not accept the removed flattened v2 path syntax", () => {
    const source = `val legacy = Path(Pose(0.0, 0.0), Pose(24.0, 0.0)).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(legacy)`;

    expect(parsePathPlannerKotlin(source)).toBeNull();
  });

  it("sanitises path names that are not valid kotlin identifiers", () => {
    const contents = serializePathPlannerKotlin(
      [
        { id: "init-point", nx: 0.5, ny: 0.5, color: "#fff", locked: true, heading: 0 },
        { id: "a", name: "to basket!", nx: 0.6, ny: 0.6, color: "#fff", locked: false },
      ],
      [],
      [{ id: "s", kind: "path", pointId: "a" }]
    );

    expect(contents).toContain("val toBasket = Path(");
    expect(contents).not.toContain("to basket!");
  });

  it("gives duplicate path names unique kotlin identifiers", () => {
    const contents = serializePathPlannerKotlin(
      [
        { id: "init-point", nx: 0.5, ny: 0.5, color: "#fff", locked: true, heading: 0 },
        { id: "a", name: "score", nx: 0.6, ny: 0.6, color: "#fff", locked: false },
        { id: "b", name: "score", nx: 0.7, ny: 0.7, color: "#fff", locked: false },
      ],
      [],
      [
        { id: "s1", kind: "path", pointId: "a" },
        { id: "s2", kind: "path", pointId: "b" },
      ]
    );

    expect(contents).toContain("val score = Path(");
    expect(contents).toContain("val score2 = Path(");
  });

  it("exports and imports each segment's own geometry", () => {
    const contents = serializePathPlannerKotlin(
      [
        { id: "init-point", nx: 0.5, ny: 0.5, color: "#fff", locked: true, heading: 0 },
        {
          id: "a",
          name: "direct",
          nx: 0.75,
          ny: 0.5,
          color: "#fff",
          locked: false,
          pathGeometry: "spline",
          segmentId: "final",
          controlPoints: [{ id: "first", nx: 0.6, ny: 0.4, pathGeometry: "linear" }],
        },
      ],
      [],
      [{ id: "s", kind: "path", pointId: "a" }]
    );

    expect(contents).toContain("Linear(");
    expect(contents).toContain("Spline(");
    expect(contents.match(/Pose\(/g)).toHaveLength(6);
    const importedPath = parsePathPlannerKotlin(contents)?.points[1];
    expect(importedPath?.pathGeometry).toBe("spline");
    expect(importedPath?.controlPoints?.[0].pathGeometry).toBe("linear");
    expect(importedPath?.controlPoints).toHaveLength(1);
  });
});

describe("robot constants and saved poses", () => {
  it("parses constants and resolves poses expressed against them", () => {
    const constants = parseRobotConstantsKotlin(`object Constants {
    const val WIDTH: Double = 18.0
    const val LENGTH: Double = 17.0

    val follower = FollowerConstants()
        .forwardZeroPowerAcceleration(40.0)
        .lateralZeroPowerAcceleration(35.0)
        .xVelocity(60.0)
        .yVelocity(50.0)
}`);

    expect(constants).toEqual({
      width: 18,
      length: 17,
      forwardBrakeStrength: 40,
      lateralBrakeStrength: 35,
      maxForwardVelocity: 60,
      maxLateralVelocity: 50,
    });

    const poses = parseSavedPosesKotlin(
      `val START_WALL = Pose(-72.0 + Constants.HALF_WIDTH, 0.0, 90.0)`,
      constants ?? DEFAULT_ROBOT_CONSTANTS
    );

    expect(poses).toHaveLength(1);
    expect(poses[0].name).toBe("WALL");
    expect(poses[0].x).toBeCloseTo(-72 + 9, 6);
    expect(poses[0].heading).toBe(90);
  });

  it("keeps the precision of a trigger's t through a round trip", () => {
    const source = `val toBasket = Path(
    Linear(
        Pose(0.0, 0.0),
        Pose(24.0, 0.0),
    ),
).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(
        toBasket
            .submitAt(0.35, Actions.LIFT)
            .removeAt(0.875, Actions.INTAKE)
    )`;

    const output = roundTrip(source);
    expect(output).toContain("submitAt(0.35, Actions.LIFT)");
    expect(output).toContain("removeAt(0.875, Actions.INTAKE)");
  });

  it("keeps the precision of a linear heading's t window through a round trip", () => {
    const source = `val toBasket = Path(
    Linear(
        Pose(0.0, 0.0),
        Pose(24.0, 0.0),
    ),
).linearHeading(0.0, 90.0, 0.25, 0.75)

autonSequence(Alliance.BLUE)
    .path(toBasket)`;

    expect(roundTrip(source)).toContain("linearHeading(0.0, 90.0, 0.25, 0.75)");
  });

  it("gives a path followed more than once its own point each time", () => {
    // The usual FTC cycle: out and back, twice, reusing the declared paths.
    const source = `val toSample = Path(Linear(Pose(0.0, 0.0), Pose(36.0, 0.0))).constantHeading(0.0)

val toBasket = Path(Linear(Pose(36.0, 0.0), Pose(0.0, 24.0))).constantHeading(45.0)

autonSequence(Alliance.BLUE)
    .path(toSample)
    .path(toBasket)
    .path(toSample)
    .path(toBasket)`;

    const parsed = parsePathPlannerKotlin(source);
    const pathItems = parsed!.sequenceItems.filter((item) => item.kind === "path");
    const referenced = new Set(pathItems.map((item) => item.pointId));

    expect(pathItems).toHaveLength(4);
    // Every path call needs its own point, or the sequence drives a path the
    // robot is not standing at the start of.
    expect(referenced.size).toBe(4);
    expect(parsed!.points.slice(1).every((point) => referenced.has(point.id))).toBe(true);
  });

  it("keeps each path call's own triggers when a path is reused", () => {
    const source = `val loop = Path(Linear(Pose(0.0, 0.0), Pose(24.0, 0.0))).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(
        loop
            .submitAt(0.2, Actions.FIRST)
    )
    .path(
        loop
            .submitAt(0.8, Actions.SECOND)
    )`;

    const parsed = parsePathPlannerKotlin(source);
    const triggerNames = parsed!.points.slice(1).map((point) =>
      (point.actionTriggers ?? []).map((trigger) => trigger.actionName)
    );

    expect(triggerNames).toEqual([["FIRST"], ["SECOND"]]);
  });

  it("round trips a reused path without rewriting the sequence", () => {
    const source = `val loop = Path(
    Linear(
        Pose(0.0, 0.0),
        Pose(24.0, 0.0),
    ),
).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(loop)
    .path(loop)`;

    // Re-exporting must at least be stable: a second trip cannot keep mutating it.
    const once = roundTrip(source);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });

  it("returns null when the constants file is missing required values", () => {
    expect(parseRobotConstantsKotlin("object Constants { const val WIDTH: Double = 18.0 }")).toBeNull();
  });
});
