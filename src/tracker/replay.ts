import type { FieldPose, RobotSize } from "../field/geometry";

export type RecordedSample = { timeMs: number; phase: string; states: Record<string, unknown>; errors: Record<string, string> };
export type Recording = {
  opMode: string; robot: RobotSize; states: string[]; samples: RecordedSample[];
  durationMs: number; incomplete: boolean; droppedSamples: number; sizeLimitReached: boolean;
};
export const MAX_RECORDING_BYTES = 32 * 1024 * 1024;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function recordedPose(value: unknown): FieldPose | null {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.heading)
    ? { x: value.x, y: value.y, heading: value.heading } : null;
}

/** An unfinished final line is expected when downloading a recording still being written. */
export function parseRecording(text: string): Recording {
  if (text.length > MAX_RECORDING_BYTES) throw new Error("Recording exceeds 32 MB");
  const lines = text.split("\n");
  const values: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let value: unknown;
    try { value = JSON.parse(lines[i]); }
    catch {
      if (i === lines.length - 1 && !text.endsWith("\n")) break;
      throw new Error(`Invalid JSON on line ${i + 1}`);
    }
    if (!record(value)) throw new Error(`Invalid record on line ${i + 1}`);
    values.push(value);
  }
  const header = values.shift();
  if (!header || header.type !== "header" || header.version !== 1 || typeof header.opMode !== "string" ||
      !record(header.robot) || !finite(header.robot.width) || header.robot.width <= 0 ||
      !finite(header.robot.length) || header.robot.length <= 0 || !Array.isArray(header.states) ||
      !header.states.every((s) => typeof s === "string" && s.length > 0) || new Set(header.states).size !== header.states.length)
    throw new Error("Unsupported recording header");
  const samples: RecordedSample[] = [];
  let ended = false, droppedSamples = 0, sizeLimitReached = false;
  for (const value of values) {
    if (ended) throw new Error("Data after recording end");
    if (value.type === "end") {
      if (!Number.isSafeInteger(value.droppedSamples) || (value.droppedSamples as number) < 0 || typeof value.sizeLimitReached !== "boolean")
        throw new Error("Invalid recording footer");
      ended = true; droppedSamples = value.droppedSamples as number; sizeLimitReached = value.sizeLimitReached;
      continue;
    }
    if (value.type !== "sample" || !finite(value.timeMs) || value.timeMs < 0 ||
        value.timeMs < (samples.at(-1)?.timeMs ?? 0) || typeof value.phase !== "string" ||
        !record(value.states) || !record(value.errors) || !Object.values(value.errors).every((e) => typeof e === "string"))
      throw new Error("Invalid recording sample");
    samples.push(value as unknown as RecordedSample);
    if (samples.length > 100_000) throw new Error("Too many recording samples");
  }
  if (!samples.length) throw new Error("Recording has no samples");
  return { opMode: header.opMode, robot: header.robot as RobotSize, states: header.states as string[], samples,
    durationMs: samples.at(-1)!.timeMs, incomplete: !ended, droppedSamples, sizeLimitReached };
}

export function sampleIndex(samples: RecordedSample[], timeMs: number): number {
  let lo = 0, hi = samples.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (samples[mid].timeMs <= timeMs) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

export function replayTrail(recording: Recording, index: number, timeMs: number): FieldPose[] {
  const trail: FieldPose[] = [];
  for (let i = Math.max(0, index - 599); i <= index; i++) {
    const sample = recording.samples[i];
    if (timeMs - sample.timeMs > 30_000) continue;
    const pose = recordedPose(sample.states.pose);
    if (pose) trail.push(pose);
  }
  return trail;
}
