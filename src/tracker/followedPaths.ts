import type { FieldPosition } from "../field/geometry";

export type FollowedPath = { id: number; points: FieldPosition[] };
export type RecordedPath = FollowedPath & { timeMs: number };
export type PathProgress = { id: number; t: number };

export function parseFollowedPath(value: unknown): FollowedPath | null {
  if (typeof value !== "object" || value === null) return null;
  const path = value as Partial<FollowedPath>;
  if (!Number.isSafeInteger(path.id) || !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 129 ||
      !path.points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  return { id: path.id!, points: path.points.map(({ x, y }) => ({ x, y })) };
}

export function parsePathProgress(value: unknown): PathProgress | null {
  if (typeof value !== "object" || value === null) return null;
  const progress = value as Partial<PathProgress>;
  return Number.isSafeInteger(progress.id) && typeof progress.t === "number" && Number.isFinite(progress.t)
    ? { id: progress.id!, t: Math.max(0, Math.min(1, progress.t)) } : null;
}
