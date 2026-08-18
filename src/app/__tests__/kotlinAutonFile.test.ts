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
  it("preserves headings, control points, triggers and sequence order", () => {
    const source = `val toBasket = Path(
    Pose(-60.0, -36.0),
    Pose(-24.0, -12.0),
    Pose(12.0, 24.0),
).constantHeading(45.0)

val toSub = Path(
    Pose(12.0, 24.0),
    Pose(48.0, 36.0),
).linearHeading(45.0, -90.0, 0.2, 0.8)

val park = Path(
    Pose(48.0, 36.0),
    Pose(60.0, -60.0),
).reversedTangentHeading()

autonSequence(Alliance.RED)
    .followPath(
        toBasket
            .startAt(0.3, Actions.INTAKE)
            .stopAt(0.9, Actions.INTAKE)
    )
    .run(Actions.DEPOSIT, 1.5)
    .followPath(toSub)
    .start(Actions.LIFT)
    .followPath(park)
    .stop(Actions.LIFT)`;

    expect(roundTrip(source)).toBe(source);
  });

  it("keeps tangential headings distinct from their reversed form", () => {
    const source = `val forward = Path(
    Pose(0.0, 0.0),
    Pose(24.0, 0.0),
).tangentHeading()

autonSequence(Alliance.BLUE)
    .followPath(forward)`;

    expect(roundTrip(source)).toBe(source);
    expect(roundTrip(source)).not.toContain("reversedTangentHeading");
  });

  it("omits the linear t-range when it spans the whole path", () => {
    const source = `val sweep = Path(
    Pose(0.0, 0.0),
    Pose(24.0, 24.0),
).linearHeading(0.0, 90.0)

autonSequence(Alliance.BLUE)
    .followPath(sweep)`;

    expect(roundTrip(source)).toBe(source);
  });

  it("round trips named start poses instead of inlining their coordinates", () => {
    const savedPoses: SavedPose[] = [{ name: "BASKET", x: -60, y: -60, heading: 45 }];
    const source = `val leave = Path(
    Poses.START_BASKET,
    Pose(0.0, 0.0),
).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .followPath(leave)`;

    expect(roundTrip(source, savedPoses)).toBe(source);
  });

  it("rejects kotlin that is not an auton export", () => {
    expect(parsePathPlannerKotlin("class Robot { fun main() {} }", [])).toBeNull();
    expect(parsePathPlannerKotlin("", [])).toBeNull();
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

  it("returns null when the constants file is missing required values", () => {
    expect(parseRobotConstantsKotlin("object Constants { const val WIDTH: Double = 18.0 }")).toBeNull();
  });
});
