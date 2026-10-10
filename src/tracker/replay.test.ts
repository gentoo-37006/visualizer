import { describe, expect, it } from "vitest";
import { parseRecording, recordedPose, replayPose, replayTrail, sampleIndex } from "./replay";

const header = { type: "header", version: 1, opMode: "Teleop", robot: { width: 16, length: 16 }, states: ["pose", "intake"] };
const sample = (timeMs: number, pose: unknown = { x: 1, y: 2, heading: 90 }) => ({ type: "sample", timeMs, phase: "RUNNING", states: { pose, intake: true }, errors: {} });
const end = { type: "end", droppedSamples: 2, sizeLimitReached: false };
const encode = (...values: unknown[]) => values.map((v) => JSON.stringify(v)).join("\n") + "\n";

describe("recording replay", () => {
  it("interpolates coordinates and takes the shortest turn across heading wrap", () => {
    const log = parseRecording(encode(header, sample(0, { x: 0, y: 10, heading: 350 }), sample(100, { x: 20, y: -10, heading: 10 }), end));
    expect(replayPose(log.samples, 25)).toEqual({ x: 5, y: 5, heading: 355 });
    expect(replayPose(log.samples, 50)).toEqual({ x: 10, y: 0, heading: 360 });
    expect(replayPose(log.samples, 100)).toEqual({ x: 20, y: -10, heading: 10 });
    expect(replayPose(log.samples, 200)).toEqual({ x: 20, y: -10, heading: 10 });
    expect(replayPose(log.samples, -1)).toBeNull();
  });
  it("turns backwards across zero without a full rotation", () => {
    const log = parseRecording(encode(header, sample(0, { x: 0, y: 0, heading: 10 }), sample(100, { x: 0, y: 0, heading: 350 }), end));
    expect(replayPose(log.samples, 50)?.heading).toBe(0);
  });
  it("does not interpolate through missing poses and handles duplicate timestamps", () => {
    const log = parseRecording(encode(header, sample(0), sample(100, null), sample(200), sample(200, { x: 8, y: 9, heading: 0 }), end));
    expect(replayPose(log.samples, 50)).toEqual({ x: 1, y: 2, heading: 90 });
    expect(replayPose(log.samples, 150)).toBeNull();
    expect(replayPose(log.samples, 200)).toEqual({ x: 8, y: 9, heading: 0 });
  });
  it("preserves arbitrary states, metadata, and dropped samples", () => {
    const log = parseRecording(encode(header, sample(0), sample(50), end));
    expect(log.states).toEqual(["pose", "intake"]);
    expect(log.samples[1].states.intake).toBe(true);
    expect(log.durationMs).toBe(50);
    expect(log.incomplete).toBe(false);
    expect(log.droppedSamples).toBe(2);
  });
  it("accepts interrupted writes but not malformed interior lines", () => {
    expect(parseRecording(encode(header, sample(0)) + '{"type":').incomplete).toBe(true);
    expect(() => parseRecording(encode(header) + 'broken\n' + encode(sample(0)))).toThrow();
  });
  it("rejects unsupported schema and invalid timelines", () => {
    expect(() => parseRecording(encode({ ...header, version: 2 }, sample(0)))).toThrow();
    expect(() => parseRecording(encode(header, sample(50), sample(0)))).toThrow();
    expect(() => parseRecording(encode(header, sample(-1)))).toThrow();
    expect(() => parseRecording(encode(header, sample(0), end, sample(50)))).toThrow();
    expect(() => parseRecording(encode(header))).toThrow();
  });
  it("seeks to the last sample at or before the cursor, including duplicates", () => {
    const log = parseRecording(encode(header, sample(10), sample(50), sample(50), end));
    expect(sampleIndex(log.samples, 0)).toBe(-1);
    expect(sampleIndex(log.samples, 49)).toBe(0);
    expect(sampleIndex(log.samples, 50)).toBe(2);
    expect(sampleIndex(log.samples, 100)).toBe(2);
  });
  it("keeps missing poses missing and limits trails to recent samples", () => {
    const log = parseRecording(encode(header, sample(0), sample(100, null), sample(31000), end));
    expect(recordedPose(null)).toBe(null);
    expect(recordedPose({ x: Infinity, y: 0, heading: 0 })).toBe(null);
    expect(replayTrail(log, 2, 31000)).toHaveLength(1);
    expect(replayTrail(log, -1, 0)).toEqual([]);
  });
});
