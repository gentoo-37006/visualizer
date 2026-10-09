import type { FieldPose, RobotSize } from "../field/geometry";

export type PoseSnapshot = {
  version: 1;
  sessionId: number;
  sequence: number;
  active: boolean;
  opMode: string | null;
  ageMs: number | null;
  pose: FieldPose | null;
  robot: RobotSize | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function parsePoseSnapshot(value: unknown): PoseSnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.sessionId) || !Number.isSafeInteger(value.sequence) ||
      typeof value.active !== "boolean" || !(value.opMode === null || typeof value.opMode === "string") ||
      !(value.ageMs === null || (isFiniteNumber(value.ageMs) && value.ageMs >= 0))) return null;
  if (value.pose !== null && (!isRecord(value.pose) || !isFiniteNumber(value.pose.x) || !isFiniteNumber(value.pose.y) || !isFiniteNumber(value.pose.heading))) return null;
  if (value.robot !== null && (!isRecord(value.robot) || !isFiniteNumber(value.robot.width) || value.robot.width <= 0 || !isFiniteNumber(value.robot.length) || value.robot.length <= 0)) return null;
  if (value.pose !== null && (value.robot === null || value.ageMs === null)) return null;
  return value as PoseSnapshot;
}

export type FeedStatus = "Connecting" | "Live" | "No pose" | "Idle" | "Stale" | "Disconnected" | "Paused";

export function getFeedStatus(snapshot: PoseSnapshot | null, receivedAt: number, now: number, failed: boolean, paused: boolean): FeedStatus {
  if (paused) return "Paused";
  if (failed) return "Disconnected";
  if (!snapshot) return "Connecting";
  if (now - receivedAt > 1500) return "Stale";
  if (!snapshot.active) return "Idle";
  if (!snapshot.pose) return "No pose";
  if (snapshot.ageMs === null || snapshot.ageMs + now - receivedAt > 1000) return "Stale";
  return "Live";
}

export type TrailSample = FieldPose & { receivedAt: number };
export function appendTrail(trail: TrailSample[], snapshot: PoseSnapshot, receivedAt: number): TrailSample[] {
  const recent = trail.filter((sample) => receivedAt - sample.receivedAt <= 30_000);
  if (!snapshot.active || !snapshot.pose || snapshot.ageMs === null || snapshot.ageMs > 1000) return recent;
  const last = recent[recent.length - 1];
  if (last && last.x === snapshot.pose.x && last.y === snapshot.pose.y) return recent;
  return [...recent, { ...snapshot.pose, receivedAt }].slice(-600);
}
