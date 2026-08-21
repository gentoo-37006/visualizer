import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_PERIOD_SECONDS,
  buildPlaybackTimeline,
  clamp01,
  createPlaybackTrackBackground,
  getAutonomousOvertime,
  getOutOfBoundsPointIds,
  getPathDurationsByPointId,
  getPlaybackPoseAtTime,
  interpolateHeading,
  isRobotInsideField,
  interpolateHeadingRange,
} from "../playback";
import { DEFAULT_ROBOT_CONSTANTS, type RobotConstants } from "../kotlinAutonFile";
import { DEFAULT_MOTION_PARAMETERS } from "../plannerStorage";
import { INITIAL_POINT_ID } from "../plannerConstants";
import type { AutonSequenceItem, Point } from "../plannerTypes";

const ROBOT: RobotConstants = {
  ...DEFAULT_ROBOT_CONSTANTS,
  forwardBrakeStrength: 40,
  lateralBrakeStrength: 40,
  maxForwardVelocity: 60,
  maxLateralVelocity: 60,
};

const start: Point = {
  id: INITIAL_POINT_ID,
  nx: 0.5,
  ny: 0.5,
  color: "#fff",
  locked: true,
  heading: 0,
};

const straightPath: Point = {
  id: "a",
  name: "toBasket",
  nx: 0.75,
  ny: 0.5,
  color: "#0f0",
  locked: false,
  headingMode: "constant",
  constantHeading: 0,
};

const timelineFor = (points: Point[], items: AutonSequenceItem[]) =>
  buildPlaybackTimeline(points, items, ROBOT, DEFAULT_MOTION_PARAMETERS);

describe("heading interpolation", () => {
  it("takes the short way around the wrap point", () => {
    // 170 -> -170 is 20 degrees forward, not 340 back. The midpoint is the
    // antipode, which is equally correct as +180 or -180.
    const antipodeDistance = (heading: number) => Math.abs(Math.abs(heading) - 180);
    expect(antipodeDistance(interpolateHeading(170, -170, 0.5))).toBeCloseTo(0, 6);
    expect(antipodeDistance(interpolateHeading(-170, 170, 0.5))).toBeCloseTo(0, 6);
    expect(interpolateHeading(0, 90, 0.5)).toBeCloseTo(45, 6);
    expect(interpolateHeading(170, -170, 0.25)).toBeCloseTo(175, 6);
  });

  it("holds the endpoints outside the configured t window", () => {
    expect(interpolateHeadingRange(0, 90, 0.1, 0.25, 0.75)).toBe(0);
    expect(interpolateHeadingRange(0, 90, 0.9, 0.25, 0.75)).toBe(90);
    expect(interpolateHeadingRange(0, 90, 0.5, 0.25, 0.75)).toBeCloseTo(45, 6);
  });

  it("degenerates to a step when the window is empty or inverted", () => {
    expect(interpolateHeadingRange(0, 90, 0.2, 0.5, 0.5)).toBe(0);
    expect(interpolateHeadingRange(0, 90, 0.8, 0.5, 0.5)).toBe(90);
    expect(interpolateHeadingRange(0, 90, 0.9, 0.8, 0.2)).toBe(90);
  });

  it("clamps normalised values", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe("playback timeline", () => {
  it("is empty for an auton with no movement", () => {
    const timeline = timelineFor([start], []);
    expect(timeline.segments).toHaveLength(0);
    expect(timeline.totalTime).toBe(0);
  });

  it("spends real time driving a straight path", () => {
    const timeline = timelineFor(
      [start, straightPath],
      [{ id: "s1", kind: "path", pointId: "a" }]
    );

    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].kind).toBe("path");
    expect(timeline.totalTime).toBeGreaterThan(0);
  });

  it("adds a rotate segment when the path starts at a different heading", () => {
    const timeline = timelineFor(
      [start, { ...straightPath, constantHeading: 90 }],
      [{ id: "s1", kind: "path", pointId: "a" }]
    );

    const kinds = timeline.segments.map((segment) => segment.kind);
    expect(kinds).toEqual(["rotate", "path"]);

    // 90 degrees at the default 180 deg/s.
    const rotate = timeline.segments[0];
    expect(rotate.duration).toBeCloseTo(90 / DEFAULT_MOTION_PARAMETERS.maxAngularVelocity, 6);
  });

  it("only lets timed run actions consume time", () => {
    const withStart = timelineFor(
      [start],
      [{ id: "s1", kind: "action", name: "LIFT", mode: "start", timeout: 5 }]
    );
    expect(withStart.totalTime).toBe(0);

    const withRun = timelineFor(
      [start],
      [{ id: "s1", kind: "action", name: "LIFT", mode: "run", timeout: 5 }]
    );
    expect(withRun.totalTime).toBe(5);
    expect(withRun.segments[0].kind).toBe("wait");
  });

  it("lays segments end to end without gaps", () => {
    const timeline = timelineFor(
      [start, { ...straightPath, constantHeading: 45 }],
      [
        { id: "s1", kind: "action", name: "LIFT", mode: "run", timeout: 1 },
        { id: "s2", kind: "path", pointId: "a" },
      ]
    );

    let expectedStart = 0;
    for (const segment of timeline.segments) {
      expect(segment.startTime).toBeCloseTo(expectedStart, 6);
      expectedStart += segment.duration;
    }
    expect(timeline.totalTime).toBeCloseTo(expectedStart, 6);
  });

  it("skips path items whose point no longer exists", () => {
    const timeline = timelineFor([start], [{ id: "s1", kind: "path", pointId: "gone" }]);
    expect(timeline.segments).toHaveLength(0);
  });

  it("takes longer when the robot is slower", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const fast = buildPlaybackTimeline([start, straightPath], items, ROBOT, DEFAULT_MOTION_PARAMETERS);
    const slow = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, maxForwardVelocity: 15, maxLateralVelocity: 15 },
      DEFAULT_MOTION_PARAMETERS
    );

    expect(slow.totalTime).toBeGreaterThan(fast.totalTime);
  });
});

describe("playback pose sampling", () => {
  const points = [start, straightPath];
  const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];

  it("starts at the start pose and ends at the path end", () => {
    const timeline = timelineFor(points, items);

    const first = getPlaybackPoseAtTime(timeline, 0, points).pose;
    expect(first.nx).toBeCloseTo(start.nx, 4);
    expect(first.ny).toBeCloseTo(start.ny, 4);

    const last = getPlaybackPoseAtTime(timeline, timeline.totalTime, points).pose;
    expect(last.nx).toBeCloseTo(straightPath.nx, 3);
    expect(last.ny).toBeCloseTo(straightPath.ny, 3);
  });

  it("advances monotonically along the path", () => {
    const timeline = timelineFor(points, items);
    let previous = -Infinity;

    for (let step = 0; step <= 20; step += 1) {
      const { pose } = getPlaybackPoseAtTime(timeline, (timeline.totalTime * step) / 20, points);
      expect(pose.nx).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = pose.nx;
    }
  });

  it("falls back to the start pose when there is nothing to play", () => {
    const { pose } = getPlaybackPoseAtTime({ segments: [], totalTime: 0 }, 0, points);
    expect(pose.nx).toBe(start.nx);
    expect(pose.ny).toBe(start.ny);
  });
});

describe("autonomous period budget", () => {
  it("reports no overtime for an auton that fits", () => {
    expect(getAutonomousOvertime(AUTONOMOUS_PERIOD_SECONDS)).toBe(0);
    expect(getAutonomousOvertime(0)).toBe(0);
    expect(getAutonomousOvertime(Number.NaN)).toBe(0);
  });

  it("reports how far past the period an auton runs", () => {
    expect(getAutonomousOvertime(AUTONOMOUS_PERIOD_SECONDS + 4.5)).toBeCloseTo(4.5, 6);
  });

  it("marks the deadline on the track only once the auton overruns", () => {
    const withinBudget = createPlaybackTrackBackground({
      segments: [],
      totalTime: AUTONOMOUS_PERIOD_SECONDS,
    });
    const overBudget = createPlaybackTrackBackground({
      segments: [],
      totalTime: AUTONOMOUS_PERIOD_SECONDS * 2,
    });

    expect(withinBudget).not.toContain("calc(");
    // Half the track, because the auton runs twice as long as it is allowed to.
    expect(overBudget).toContain("calc(50.000% - 1.5px)");
  });
});

describe("per-path durations", () => {
  it("charges a path for the turn onto its start heading", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const straight = timelineFor([start, straightPath], items);
    const turned = timelineFor([start, { ...straightPath, constantHeading: 90 }], items);

    expect(getPathDurationsByPointId(straight).get("a")).toBeCloseTo(straight.totalTime, 6);
    expect(getPathDurationsByPointId(turned).get("a")).toBeCloseTo(turned.totalTime, 6);
    expect(getPathDurationsByPointId(turned).get("a")!).toBeGreaterThan(
      getPathDurationsByPointId(straight).get("a")!
    );
  });

  it("leaves waits out, so the durations only cover driving", () => {
    const timeline = timelineFor(
      [start, straightPath],
      [
        { id: "s1", kind: "path", pointId: "a" },
        { id: "s2", kind: "action", name: "SCORE", mode: "run", timeout: 5 },
      ]
    );
    const durations = getPathDurationsByPointId(timeline);

    expect(durations.size).toBe(1);
    expect(durations.get("a")).toBeCloseTo(timeline.totalTime - 5, 6);
  });
});

describe("robot footprint against the field walls", () => {
  const square = { width: 16, length: 16 };

  it("fits at the centre of the field", () => {
    expect(isRobotInsideField({ nx: 0.5, ny: 0.5, heading: 0 }, square.width, square.length)).toBe(true);
  });

  it("catches a centre parked on the wall", () => {
    // The point itself is legal; half the robot is inside the wall.
    expect(isRobotInsideField({ nx: 1, ny: 0.5, heading: 0 }, square.width, square.length)).toBe(false);
    expect(isRobotInsideField({ nx: 0.5, ny: 0, heading: 0 }, square.width, square.length)).toBe(false);
  });

  it("allows a robot backed exactly up to the wall", () => {
    // 72 - 8 inches from centre, so the near edge just touches.
    expect(isRobotInsideField({ nx: 64 / 144 + 0.5, ny: 0.5, heading: 0 }, square.width, square.length)).toBe(true);
  });

  it("accounts for the diagonal a turned robot sweeps", () => {
    const nearWall = { nx: 63 / 144 + 0.5, ny: 0.5, heading: 45 };
    expect(isRobotInsideField(nearWall, square.width, square.length)).toBe(false);
    expect(isRobotInsideField({ ...nearWall, heading: 0 }, square.width, square.length)).toBe(true);
  });

  it("uses length along the heading and width across it", () => {
    const longRobot = { width: 12, length: 30 };
    const pose = { nx: 60 / 144 + 0.5, ny: 0.5, heading: 0 };

    // Facing up the field, only the 12in width points at the side wall.
    expect(isRobotInsideField(pose, longRobot.width, longRobot.length)).toBe(true);
    // Facing the wall, the 30in length does.
    expect(isRobotInsideField({ ...pose, heading: 90 }, longRobot.width, longRobot.length)).toBe(false);
  });
});

describe("paths that leave the field", () => {
  const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];

  it("stays quiet for a path that keeps the robot inside", () => {
    const timeline = timelineFor([start, straightPath], items);
    expect(getOutOfBoundsPointIds(timeline, 16, 16).size).toBe(0);
  });

  it("names the path that drives the robot into a wall", () => {
    const timeline = timelineFor([start, { ...straightPath, nx: 1 }], items);
    expect([...getOutOfBoundsPointIds(timeline, 16, 16)]).toEqual(["a"]);
  });

  it("catches a corner swept out by turning in place", () => {
    // Backed up to the wall facing it, the robot fits; turned 45 degrees it does not.
    const againstWall = { ...straightPath, nx: 63 / 144 + 0.5, constantHeading: 45 };
    const timeline = timelineFor([start, againstWall], items);
    expect(getOutOfBoundsPointIds(timeline, 16, 16).has("a")).toBe(true);
  });
});
