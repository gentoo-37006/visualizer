import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROBOT_CONSTANTS,
  parsePathPlannerKotlin,
  parsePedroConstants,
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
  it("preserves the manual start heading even when its coordinates match a saved pose", () => {
    const savedPoses: SavedPose[] = [{ name: "ORIGIN", x: 0, y: 0, heading: 0 }];
    const points = [
      { id: "init-point", nx: 0.5, ny: 0.5, color: "#fff", locked: true, heading: -75 },
      { id: "path", nx: 0.75, ny: 0.5, color: "#fff", locked: false, constantHeading: 30 },
    ];

    const output = serializePathPlannerKotlin(points, savedPoses);
    expect(output).toContain("Pose(0.0, 0.0, -75.0)");
    expect(output).toContain("constantHeading(30.0)");
    expect(parsePathPlannerKotlin(output, savedPoses)?.points[0].heading).toBe(-75);
    expect(roundTrip(output, savedPoses)).toBe(output);
  });

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
  it("parses robot constants and ignores direct Pose declarations as saved poses", () => {
    const constants = parsePedroConstants(`public class Constants {
    public static final double WIDTH = 99.0;
    public static final double LENGTH = 98.0;
    public static ForesightConfig foresightConfig = new ForesightConfig(c -> {
        c.maxAchievableForwardVelocity.set(72.5);
        c.maxAchievableStrafeVelocity.set(52.25);
        c.naturalForwardDeceleration.set(85.0);
        c.naturalStrafeDeceleration.set(104.5);
        c.maxAccelerationConstraint.set(40.0);
        c.maxVelocityConstraint.set(ForesightConfig.Constraint.NONE);
        c.maxDecelerationConstraint.set(50.0);
        c.coastDownToVelocity.set(7.5);
        c.brakeAggression.set(0.9);
        c.headingFeedback.set(Controller.proportional(4.5));
        c.headingStaticFF.set(Controller.staticFeedforward(0.03));
        c.headingBrakeCoefficients.set(Vector2D.cartesian(0.05, 0.006));
        c.linearBrakeCoefficients.set(Matrix.diag(0.11, 0.09));
        c.quadraticBrakeCoefficients.set(Matrix.diag(0.0015, 0.0014));
        c.cosineScale.set(true);
        c.turnBeforeDriving.set(true);
        c.headingDeviationTolerance.set(Math.toRadians(12.0));
    });
}`, { width: 18, length: 17 });

    expect(constants).toMatchObject({
      width: 18,
      length: 17,
      maxAchievableForwardVelocity: 72.5,
      maxAchievableStrafeVelocity: 52.25,
      naturalForwardDeceleration: 85,
      naturalStrafeDeceleration: 104.5,
      maxAccelerationConstraint: 40,
      maxVelocityConstraint: null,
      maxDecelerationConstraint: 50,
      coastDownToVelocity: 7.5,
      brakeAggression: 0.9,
      headingFeedback: 4.5,
      headingStaticFeedforward: 0.03,
      headingBrakeLinear: 0.05,
      headingBrakeQuadratic: 0.006,
      linearBrakeForward: 0.11,
      linearBrakeStrafe: 0.09,
      quadraticBrakeForward: 0.0015,
      quadraticBrakeStrafe: 0.0014,
      cosineScale: true,
      turnBeforeDriving: true,
      headingDeviationTolerance: 12,
    });

    expect(
      parseSavedPosesKotlin(
        `val START_WALL = Pose(-72.0 + Constants.HALF_WIDTH, 0.0, 90.0)`,
        constants ?? DEFAULT_ROBOT_CONSTANTS
      )
    ).toEqual([]);
  });

  it("parses start poses defined from field-coordinate constraints", () => {
    const poses = parseSavedPosesKotlin(
      `private val NORTH_WALL = Vertical(HALF_FIELD_SIZE, Offset.NEG)
private val EAST_WALL = Horizontal(HALF_FIELD_SIZE, Offset.NEG)
private val SOUTH_WALL = Vertical(-HALF_FIELD_SIZE, Offset.POS)
private val WEST_WALL = Horizontal(-HALF_FIELD_SIZE, Offset.POS)

val START_RED_DEFAULT = startPose(
    WEST_WALL,
    NORTH_WALL,
    Heading.SOUTH
)
val START_BLUE_DEFAULT = startPose(
    EAST_WALL,
    SOUTH_WALL,
    Heading.NORTH
)`,
      { width: 18, length: 20 }
    );

    expect(poses).toEqual([
      { name: "RED_DEFAULT", x: -63, y: 62, heading: 180 },
      { name: "BLUE_DEFAULT", x: 63, y: -62, heading: 0 },
    ]);
  });

  it("parses biobuzz start poses using imported Pose companion walls", () => {
    const source = `package org.firstinspires.ftc.teamcode.config

import gentoo.myrelib.math.Pose
import gentoo.myrelib.math.Pose.Companion.EAST_WALL
import gentoo.myrelib.math.Pose.Companion.NORTH_WALL
import gentoo.myrelib.math.Pose.Companion.SOUTH_WALL
import gentoo.myrelib.math.Pose.Companion.WEST_WALL
import gentoo.myrelib.math.Pose.Heading
import gentoo.myrelib.math.Pose.Horizontal
import gentoo.myrelib.math.Pose.Offset
import gentoo.myrelib.math.Pose.Vertical
import org.firstinspires.ftc.teamcode.Robot

object Poses {
    val START_RED_DEFAULT = startPose(WEST_WALL, NORTH_WALL, Heading.SOUTH,)
    val START_RED_CLOSE = startPose(Horizontal(-24.0, Offset.POS), SOUTH_WALL, Heading.SOUTH,)
    val START_BLUE_DEFAULT = startPose(EAST_WALL, SOUTH_WALL, Heading.NORTH,)
    val START_BLUE_CLOSE = startPose(Horizontal(24.0, Offset.NEG), NORTH_WALL, Heading.NORTH,)

    fun startPose(horizontal: Horizontal, vertical: Vertical, heading: Heading): Pose =
        Pose.startPose(horizontal, vertical, heading, Robot.HALF_LENGTH, Robot.HALF_WIDTH)
}`;

    expect(parseSavedPosesKotlin(source)).toEqual([
      { name: "RED_DEFAULT", x: -64, y: 64, heading: 180 },
      { name: "RED_CLOSE", x: -16, y: -64, heading: 180 },
      { name: "BLUE_DEFAULT", x: 64, y: -64, heading: 0 },
      { name: "BLUE_CLOSE", x: 16, y: 64, heading: 0 },
    ]);
    expect(parseSavedPosesKotlin(source, { width: 18, length: 20 })).toEqual([
      { name: "RED_DEFAULT", x: -63, y: 62, heading: 180 },
      { name: "RED_CLOSE", x: -15, y: -62, heading: 180 },
      { name: "BLUE_DEFAULT", x: 63, y: -62, heading: 0 },
      { name: "BLUE_CLOSE", x: 15, y: 62, heading: 0 },
    ]);
  });

  it("parses inline field coordinates and uses the heading-relative robot footprint", () => {
    const poses = parseSavedPosesKotlin(
      `val START_SIDEWAYS = startPose(
    Horizontal(-24.0, Offset.NEG),
    Vertical(-72.0, Offset.POS),
    Heading.EAST
)`,
      { width: 18, length: 20 }
    );

    expect(poses).toEqual([
      { name: "SIDEWAYS", x: -34, y: -63, heading: 90 },
    ]);
  });

  it("recognizes startPose declarations without requiring a START name", () => {
    const poses = parseSavedPosesKotlin(
      `val audienceSide: Pose = startPose(
    Horizontal(24.0, Offset.NONE),
    Vertical(48.0, Offset.NEG),
    Heading.WEST
)`,
      { width: 18, length: 20 }
    );

    expect(poses).toEqual([
      { name: "audienceSide", kotlinName: "audienceSide", x: 24, y: 39, heading: -90 },
    ]);

    const auton = `val path1 = Path(
    Linear(
        Poses.audienceSide,
        Pose(0.0, 0.0),
    ),
).constantHeading(0.0)

autonSequence(Alliance.BLUE)
    .path(path1)`;
    expect(roundTrip(auton, poses)).toContain("Poses.audienceSide");
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
    expect(parsePedroConstants("public class Constants {}")).toBeNull();
  });
});
