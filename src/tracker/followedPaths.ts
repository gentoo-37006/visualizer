import type { FieldCurve, FieldPath, FieldPosition } from "../field/geometry";
import { seededColor } from "../app/plannerColors";

export type FollowedPath = { id: number; points: FieldPosition[]; curves?: FieldCurve[] };
export type RecordedPath = FollowedPath & { timeMs: number };
export type PathProgress = { id: number; t: number };

export function followedFieldPaths(paths: FollowedPath[]): FieldPath[] {
  return paths.map(path => ({
    id: String(path.id),
    color: seededColor(String(path.id)),
    curves: path.curves ?? path.points.slice(1).map((end, index) => ({ start: path.points[index], end })),
  }));
}

export function parseFollowedPath(value: unknown): FollowedPath | null {
  if (typeof value !== "object" || value === null) return null;
  const path = value as Partial<FollowedPath>;
  if (!Number.isSafeInteger(path.id) || !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 129 ||
      !path.points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  const position = (value: unknown): value is FieldPosition => typeof value === "object" && value !== null &&
    Number.isFinite((value as FieldPosition).x) && Number.isFinite((value as FieldPosition).y);
  if (path.curves != null && (!Array.isArray(path.curves) || path.curves.length === 0 || path.curves.length > 128 ||
      !path.curves.every(curve => curve && position(curve.start) && position(curve.end) &&
        ((curve.control1 == null && curve.control2 == null) || (position(curve.control1) && position(curve.control2)))))) return null;
  return { id: path.id!, points: path.points.map(({ x, y }) => ({ x, y })),
    ...(path.curves != null ? { curves: path.curves } : {}) };
}

export function parsePathProgress(value: unknown): PathProgress | null {
  if (typeof value !== "object" || value === null) return null;
  const progress = value as Partial<PathProgress>;
  return Number.isSafeInteger(progress.id) && typeof progress.t === "number" && Number.isFinite(progress.t)
    ? { id: progress.id!, t: Math.max(0, Math.min(1, progress.t)) } : null;
}
