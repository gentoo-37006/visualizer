import { describe, expect, it } from "vitest";
import { appendTrail, getFeedStatus, parsePoseSnapshot, type PoseSnapshot } from "./telemetry";

const snapshot: PoseSnapshot = {
  version: 1, sessionId: 10, sequence: 1, active: true, opMode: "BlueAuto",
  ageMs: 10, pose: { x: 24, y: -48, heading: 90 }, robot: { width: 16, length: 18 },
};

describe("live telemetry", () => {
  it("accepts live path geometry and rejects invalid path data", () => {
    const path = { id: 1, points: [{ x: 0, y: 0 }, { x: 24, y: 24 }] };
    expect(parsePoseSnapshot({ ...snapshot, path, pathT: 0.35 })?.path).toEqual(path);
    expect(parsePoseSnapshot({ ...snapshot, path: null, pathT: 0 })).not.toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, path: { ...path, points: [] } })).toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, path, pathT: Infinity })).toBeNull();
  });
  it("validates coordinates, dimensions, and missing poses at the boundary", () => {
    expect(parsePoseSnapshot(snapshot)).toEqual(snapshot);
    expect(parsePoseSnapshot({ ...snapshot, pose: null })).not.toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, pose: { x: NaN, y: 0, heading: 0 } })).toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, robot: { width: 0, length: 16 } })).toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, ageMs: null })).toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, version: 2 })).toBeNull();
    expect(parsePoseSnapshot({ ...snapshot, pose: undefined })).toBeNull();
  });

  it("ages the robot sample independently of successful HTTP requests", () => {
    expect(getFeedStatus(snapshot, 100, 100, false, false)).toBe("Live");
    expect(getFeedStatus({ ...snapshot, ageMs: 1100 }, 100, 100, false, false)).toBe("Stale");
    expect(getFeedStatus(snapshot, 100, 1700, false, false)).toBe("Stale");
    expect(getFeedStatus({ ...snapshot, active: false }, 100, 100, false, false)).toBe("Idle");
    expect(getFeedStatus({ ...snapshot, pose: null }, 100, 100, false, false)).toBe("No pose");
    expect(getFeedStatus(snapshot, 100, 100, true, false)).toBe("Disconnected");
    expect(getFeedStatus(snapshot, 100, 100, false, true)).toBe("Paused");
  });

  it("keeps a bounded recent trail without recording idle or duplicate samples", () => {
    const trail = appendTrail([], snapshot, 0);
    expect(trail).toHaveLength(1);
    expect(appendTrail(trail, snapshot, 50)).toHaveLength(1);
    expect(appendTrail(trail, { ...snapshot, active: false }, 100)).toHaveLength(1);
    expect(appendTrail(trail, { ...snapshot, pose: null }, 100)).toHaveLength(1);
    expect(appendTrail(trail, { ...snapshot, ageMs: 1100 }, 31_000)).toEqual([]);
    const many = Array.from({ length: 600 }, (_, x) => ({ x, y: 0, heading: 0, receivedAt: 100 }));
    expect(appendTrail(many, snapshot, 200)).toHaveLength(600);
  });
});
