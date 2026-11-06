import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_PERIOD_SECONDS,
  buildPlaybackTimeline,
  clamp01,
  createPlaybackTrackBackground,
  getPlaybackActionMarkers,
  PLAYBACK_ACTION_COLOR,
  getAutonomousOvertime,
  getOutOfBoundsPointIds,
  getPathDurationsByPointId,
  getPlaybackPoseAtTime,
  interpolateHeading,
  isRobotInsideField,
  interpolateHeadingRange,
} from "../playback";
import { DEFAULT_ROBOT_CONSTANTS, type RobotConstants } from "../kotlinAutonFile";
import { INITIAL_POINT_ID } from "../plannerConstants";
import type { AutonSequenceItem, Point } from "../plannerTypes";

const ROBOT: RobotConstants = {
  ...DEFAULT_ROBOT_CONSTANTS,
  naturalForwardDeceleration: 40,
  naturalStrafeDeceleration: 40,
  maxAchievableForwardVelocity: 60,
  maxAchievableStrafeVelocity: 60,
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
  buildPlaybackTimeline(points, items, ROBOT);

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
    expect(interpolateHeadingRange(0, 90, 0.375, 0.25, 0.75)).toBeCloseTo(22.5, 6);
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

  it("drives every cubic segment in a pathchain without stopping between segments", () => {
    const joinedPath: Point = {
      ...straightPath,
      controlPoints: [
        { id: "join-1", nx: 0.58, ny: 0.35 },
        { id: "join-2", nx: 0.68, ny: 0.62 },
      ],
    };
    const timeline = timelineFor(
      [start, joinedPath],
      [{ id: "s1", kind: "path", pointId: joinedPath.id }]
    );

    expect(timeline.segments).toHaveLength(1);
    const pathSegment = timeline.segments[0];
    expect(pathSegment.kind).toBe("path");
    if (pathSegment.kind !== "path") return;

    expect(pathSegment.samples).toHaveLength(193);
    expect(pathSegment.samples[64]).toMatchObject({ nx: 0.58, ny: 0.35 });
    expect(pathSegment.samples[128]).toMatchObject({ nx: 0.68, ny: 0.62 });
  });

  it("connects linear segment endpoints with straight lines", () => {
    const linearPath: Point = {
      ...straightPath,
      pathGeometry: "linear",
      controlPoints: [{ id: "saved-join", nx: 0.6, ny: 0.2 }],
    };
    const timeline = timelineFor(
      [start, linearPath],
      [{ id: "s1", kind: "path", pointId: linearPath.id }]
    );
    const pathSegment = timeline.segments[0];
    expect(pathSegment.kind).toBe("path");
    if (pathSegment.kind !== "path") return;

    expect(pathSegment.samples).toHaveLength(129);
    expect(pathSegment.samples[32]).toMatchObject({ nx: 0.55, ny: 0.35 });
    expect(pathSegment.samples[64]).toMatchObject({ nx: 0.6, ny: 0.2 });
  });

  it("weights compound-path heading t by segment length like Pedro", () => {
    const path: Point = {
      ...straightPath,
      nx: 1,
      pathGeometry: "linear",
      controlPoints: [{ id: "short", nx: 0.6, ny: 0.5, pathGeometry: "linear" }],
      headingMode: "linear",
      startHeading: 0,
      endHeading: 100,
    };
    const timeline = timelineFor([start, path], [{ id: "s1", kind: "path", pointId: path.id }]);
    const segment = timeline.segments[0];

    expect(segment.kind).toBe("path");
    if (segment.kind !== "path") return;
    expect(segment.samples[64].heading).toBeCloseTo(20, 1);
  });

  it("does not add a pre-path rotation when the path starts at a different heading", () => {
    const timeline = timelineFor(
      [start, { ...straightPath, constantHeading: 90 }],
      [{ id: "s1", kind: "path", pointId: "a" }]
    );

    expect(timeline.segments.map((segment) => segment.kind)).toEqual(["path"]);
  });

  it("lets a large heading correction consume drivetrain power without creating a separate turn segment", () => {
    const timeline = timelineFor(
      [start, { ...straightPath, constantHeading: 180 }],
      [{ id: "s1", kind: "path", pointId: "a" }]
    );
    const early = getPlaybackPoseAtTime(timeline, 0.1, [start, straightPath]).pose;

    expect(early.nx).toBeCloseTo(start.nx, 6);
    expect(Math.abs(early.heading)).toBeGreaterThan(0);
    expect(Math.abs(early.heading)).toBeLessThan(180);
  });

  it("honors Pedro turnBeforeDriving when cosine scaling is enabled", () => {
    const point = { ...straightPath, constantHeading: 180 };
    const timeline = buildPlaybackTimeline(
      [start, point],
      [{ id: "s1", kind: "path", pointId: "a" }],
      { ...ROBOT, cosineScale: true, turnBeforeDriving: true }
    );
    const early = getPlaybackPoseAtTime(timeline, 0.1, [start, point]).pose;

    expect(early.nx).toBeCloseTo(start.nx, 6);
    expect(Math.abs(early.heading)).toBeGreaterThan(0);
  });

  it("only lets timed run actions consume time", () => {
    const withStart = timelineFor(
      [start],
      [{ id: "s1", kind: "action", name: "LIFT", mode: "submit", timeout: 5 }]
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
    const fast = buildPlaybackTimeline([start, straightPath], items, ROBOT);
    const slow = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, maxAchievableForwardVelocity: 15, maxAchievableStrafeVelocity: 15 }
    );

    expect(slow.totalTime).toBeGreaterThan(fast.totalTime);
  });

  it("reaches Pedro's maximum achievable velocity when the path is long enough", () => {
    const longStart = { ...start, nx: 0 };
    const longForwardPath = { ...straightPath, nx: 1, constantHeading: 90 };
    const timeline = buildPlaybackTimeline(
      [longStart, longForwardPath],
      [{ id: "s1", kind: "path", pointId: "a" }],
      ROBOT
    );
    const path = timeline.segments[0];

    expect(path.kind).toBe("path");
    if (path.kind !== "path") return;
    expect(path.profile.cruiseVelocity).toBeGreaterThan(ROBOT.maxAchievableForwardVelocity * 0.98);
    expect(path.profile.cruiseVelocity).toBeLessThanOrEqual(ROBOT.maxAchievableForwardVelocity);
    expect(path.profile.cruiseTime).toBeGreaterThan(0);
  });

  it("applies Pedro velocity and acceleration constraints", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const unconstrained = buildPlaybackTimeline([start, straightPath], items, ROBOT);
    const constrained = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, maxVelocityConstraint: 20, maxAccelerationConstraint: 10 }
    );

    expect(constrained.totalTime).toBeGreaterThan(unconstrained.totalTime);
  });

  it("precomputes Pedro's constrained coasting phase", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const unconstrained = buildPlaybackTimeline([start, straightPath], items, ROBOT);
    const constrained = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, maxDecelerationConstraint: 8, coastDownToVelocity: 5 }
    );

    expect(constrained.totalTime).toBeGreaterThan(unconstrained.totalTime);
  });

  it("honors brakeAtEnd when precomputing the endpoint", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const braking = buildPlaybackTimeline([start, straightPath], items, ROBOT);
    const coasting = buildPlaybackTimeline([start, straightPath], items, { ...ROBOT, brakeAtEnd: false });
    const coastPath = coasting.segments[0];

    expect(coasting.totalTime).toBeLessThan(braking.totalTime);
    expect(coastPath.kind).toBe("path");
    if (coastPath.kind !== "path") return;
    expect(coastPath.simulationFrames.at(-1)?.velocity).toBeGreaterThan(0);
  });

  it("applies Pedro's brake-aggression bias", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const conservative = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, brakeAggression: 0.5 }
    );
    const overshootBiased = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, brakeAggression: 2 }
    );

    expect(overshootBiased.totalTime).toBeGreaterThan(conservative.totalTime);
  });

  it("decelerates visibly before reaching the endpoint", () => {
    const longStart = { ...start, nx: 0, heading: 90 };
    const longPath = { ...straightPath, nx: 1, constantHeading: 90 };
    const timeline = buildPlaybackTimeline(
      [longStart, longPath],
      [{ id: "s1", kind: "path", pointId: "a" }],
      ROBOT
    );
    const path = timeline.segments[0];

    expect(path.kind).toBe("path");
    if (path.kind !== "path") return;
    const frames = path.simulationFrames;
    const brakeStart = frames.findIndex(
      (frame, index) => index > 0 && frame.velocity < frames[index - 1].velocity - 1e-6
    );
    const endpoint = frames.findIndex((frame) => frame.distance >= path.profile.distance);

    expect(brakeStart).toBeGreaterThan(0);
    expect(endpoint - brakeStart).toBeGreaterThan(20);
    expect(frames[endpoint].velocity).toBeLessThan(1);
  });

  it("applies the configured translational inertia", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const highAcceleration = buildPlaybackTimeline(
      [start, straightPath],
      items,
      ROBOT,
      { translationalAcceleration: 120, angularAcceleration: 360 }
    );
    const lowAcceleration = buildPlaybackTimeline(
      [start, straightPath],
      items,
      ROBOT,
      { translationalAcceleration: 10, angularAcceleration: 360 }
    );

    expect(lowAcceleration.totalTime).toBeGreaterThan(highAcceleration.totalTime);
  });

  it("applies the configured angular inertia", () => {
    const point = { ...straightPath, constantHeading: 180 };
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const slowTurn = buildPlaybackTimeline(
      [start, point],
      items,
      ROBOT,
      { translationalAcceleration: 60, angularAcceleration: 90 }
    );
    const fastTurn = buildPlaybackTimeline(
      [start, point],
      items,
      ROBOT,
      { translationalAcceleration: 60, angularAcceleration: 720 }
    );

    const slowHeading = Math.abs(getPlaybackPoseAtTime(slowTurn, 0.25, [start, point]).pose.heading);
    const fastHeading = Math.abs(getPlaybackPoseAtTime(fastTurn, 0.25, [start, point]).pose.heading);
    expect(slowHeading).toBeLessThan(fastHeading);
  });

  it("uses Pedro's projected stopping heading to keep constant-heading overshoot bounded", () => {
    const point = { ...straightPath, constantHeading: 90 };
    const timeline = buildPlaybackTimeline(
      [start, point],
      [{ id: "s1", kind: "path", pointId: "a" }],
      ROBOT,
      { translationalAcceleration: 60, angularAcceleration: 360 }
    );
    const path = timeline.segments[0];

    expect(path.kind).toBe("path");
    if (path.kind !== "path") return;

    const headings = path.simulationFrames.map((frame) => frame.heading);
    expect(Math.abs((headings.at(-1) ?? 0) - 90)).toBeLessThan(2);
    expect(Math.max(...headings)).toBeLessThan(92);
  });

  it("keeps heading feedback on the short side of the wrap boundary", () => {
    const wrappedStart = { ...start, heading: 170 };
    const point = { ...straightPath, constantHeading: -170 };
    const timeline = buildPlaybackTimeline(
      [wrappedStart, point],
      [{ id: "s1", kind: "path", pointId: "a" }],
      ROBOT
    );
    const early = getPlaybackPoseAtTime(timeline, 0.1, [wrappedStart, point]).pose;

    expect(early.heading).toBeGreaterThan(170);
  });

  it("anticipates a changing path heading instead of waiting for the local target to move", () => {
    const point = {
      ...straightPath,
      headingMode: "linear" as const,
      startHeading: 0,
      endHeading: 90,
      linearStartT: 0,
      linearEndT: 1,
    };
    const timeline = buildPlaybackTimeline(
      [start, point],
      [{ id: "s1", kind: "path", pointId: "a" }],
      ROBOT
    );
    const path = timeline.segments[0];

    expect(path.kind).toBe("path");
    if (path.kind !== "path") return;
    expect(path.simulationFrames[5].heading).toBeGreaterThan(0);
  });

  it("does not confuse natural coasting deceleration with active endpoint braking", () => {
    const items: AutonSequenceItem[] = [{ id: "s1", kind: "path", pointId: "a" }];
    const normal = buildPlaybackTimeline([start, straightPath], items, ROBOT);
    const lowNaturalDeceleration = buildPlaybackTimeline(
      [start, straightPath],
      items,
      { ...ROBOT, naturalForwardDeceleration: 5, naturalStrafeDeceleration: 5 }
    );

    expect(lowNaturalDeceleration.totalTime).toBeCloseTo(normal.totalTime, 6);
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
  it("colors timed action segments orange", () => {
    const timeline = timelineFor([start], [{ id: "action", kind: "action", name: "SCORE", mode: "run", timeout: 2 }]);
    expect(createPlaybackTrackBackground(timeline)).toContain(`${PLAYBACK_ACTION_COLOR} 0.000%`);
    expect(createPlaybackTrackBackground(timeline)).toContain(`${PLAYBACK_ACTION_COLOR} 100.000%`);
  });

  it("places path actions at simulated travel times with preceding waits included", () => {
    const point: Point = { ...straightPath, actionTriggers: [
      { id: "first", mode: "submit", actionName: "INTAKE", t: 0 },
      { id: "middle", mode: "submit", actionName: "SCORE", t: 0.5 },
      { id: "last", mode: "remove", actionName: "INTAKE", t: 1 },
    ] };
    const timeline = timelineFor([start, point], [
      { id: "wait", kind: "action", name: "WAIT", mode: "run", timeout: 2 },
      { id: "path", kind: "path", pointId: point.id },
    ]);
    const markers = getPlaybackActionMarkers(timeline);
    expect(markers).toHaveLength(3);
    expect(markers[0].time).toBe(2);
    expect(markers[1].time).toBeGreaterThan(2);
    expect(markers[2].time).toBeGreaterThan(markers[1].time);
    expect(markers[2].time).toBeLessThanOrEqual(timeline.totalTime);
    const pose = getPlaybackPoseAtTime(timeline, markers[1].time, [start, point]).pose;
    expect(pose.nx).toBeCloseTo((start.nx + point.nx) / 2, 4);
    expect(markers[2].label).toContain("Remove INTAKE");
  });

  it("does not create markers for paths without triggers or wait segments", () => {
    expect(getPlaybackActionMarkers(timelineFor([start, straightPath], [{ id: "path", kind: "path", pointId: straightPath.id }]))).toEqual([]);
  });
  it("reports no overtime for an auton that fits", () => {
    expect(getAutonomousOvertime(AUTONOMOUS_PERIOD_SECONDS)).toBe(0);
    expect(getAutonomousOvertime(0)).toBe(0);
    expect(getAutonomousOvertime(Number.NaN)).toBe(0);
  });

  it("reports how far past the period an auton runs", () => {
    expect(getAutonomousOvertime(AUTONOMOUS_PERIOD_SECONDS + 4.5)).toBeCloseTo(4.5, 6);
  });

  it("leaves the deadline overlay out of the segment colors", () => {
    const withinBudget = createPlaybackTrackBackground({
      segments: [],
      totalTime: AUTONOMOUS_PERIOD_SECONDS,
    });
    const overBudget = createPlaybackTrackBackground({
      segments: [],
      totalTime: AUTONOMOUS_PERIOD_SECONDS * 2,
    });

    expect(withinBudget).not.toContain("calc(");
    expect(overBudget).not.toContain("calc(");
    expect(overBudget).not.toContain("#ffffff");
    expect(overBudget).not.toContain("#111827");
  });
});

describe("per-path durations", () => {
  it("includes concurrent heading correction and endpoint settling time", () => {
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

  it("checks the centre alone when a dimension never parsed", () => {
    expect(isRobotInsideField({ nx: 0.5, ny: 0.5, heading: 0 }, Number.NaN, Number.NaN)).toBe(true);
    expect(isRobotInsideField({ nx: 1, ny: 0.5, heading: 0 }, Number.NaN, Number.NaN)).toBe(true);
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

  it("flags a start pose that begins inside a wall", () => {
    const timeline = timelineFor([start, straightPath], items);
    const buried = { ...start, nx: 1 };

    expect(getOutOfBoundsPointIds(timeline, 16, 16, start).has(start.id)).toBe(false);
    expect(getOutOfBoundsPointIds(timeline, 16, 16, buried).has(start.id)).toBe(true);
  });

  it("catches a corner swept out by turning in place", () => {
    // Backed up to the wall facing it, the robot fits; turned 45 degrees it does not.
    const againstWall = { ...straightPath, nx: 63 / 144 + 0.5, constantHeading: 45 };
    const timeline = timelineFor([start, againstWall], items);
    expect(getOutOfBoundsPointIds(timeline, 16, 16).has("a")).toBe(true);
  });
});
