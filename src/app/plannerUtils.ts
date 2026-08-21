import {
  CONTROL_POINT_RADIUS,
  FIELD_BORDER_WIDTH,
  FIELD_SIZE_INCHES,
  POINT_RADIUS,
} from "./plannerConstants";
import type { ControlPoint, DragTarget, FieldSize, HeadingInterpolation } from "./plannerTypes";

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const toFieldCoords = (nx: number, ny: number) => {
  const x = (nx - 0.5) * FIELD_SIZE_INCHES;
  const y = (0.5 - ny) * FIELD_SIZE_INCHES;
  return { x, y };
};

export const toNormalizedCoords = (x: number, y: number) => {
  let nx = x / FIELD_SIZE_INCHES + 0.5;
  let ny = 0.5 - y / FIELD_SIZE_INCHES;
  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));
  return { nx, ny };
};

export const normalizeHeading = (degrees: number) => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && degrees > 0 ? 180 : normalized;
};

export const isNumericDraft = (value: string) => /^-?(?:\d+)?(?:\.\d*)?$/.test(value);

export const isKotlinIdentifierDraft = (value: string) =>
  value === "" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

export const createDefaultHeadingValues = () => ({
  headingMode: "constant" as HeadingInterpolation,
  constantHeading: 0,
  startHeading: 0,
  endHeading: 0,
  linearStartT: 0,
  linearEndT: 1,
  tangentReversed: false,
  controlPoints: [] as ControlPoint[],
  controlsExpanded: true,
});

export const toSvgPixelCoords = (nx: number, ny: number, fieldSize: FieldSize) => ({
  x: POINT_RADIUS + FIELD_BORDER_WIDTH + nx * (fieldSize.width - FIELD_BORDER_WIDTH * 2),
  y: POINT_RADIUS + FIELD_BORDER_WIDTH + ny * (fieldSize.height - FIELD_BORDER_WIDTH * 2),
});

const interpolateBezierPoint = (points: Array<{ x: number; y: number }>, t: number) => {
  let workingPoints = points.map((point) => ({ ...point }));

  while (workingPoints.length > 1) {
    workingPoints = workingPoints.slice(0, -1).map((point, index) => ({
      x: point.x + (workingPoints[index + 1].x - point.x) * t,
      y: point.y + (workingPoints[index + 1].y - point.y) * t,
    }));
  }

  return workingPoints[0];
};

export const createSplinePath = (
  start: { x: number; y: number },
  controls: Array<{ x: number; y: number }>,
  end: { x: number; y: number }
) => {
  const bezierPoints = [start, ...controls, end];
  const sampleCount = Math.max(24, controls.length * 16);
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) =>
    interpolateBezierPoint(bezierPoints, index / sampleCount)
  );

  return samples
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
};

export const isSameTarget = (a: DragTarget | null, b: DragTarget | null) => {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") return a.index === b.index;
  if (a.kind === "control" && b.kind === "control") {
    return a.pathIndex === b.pathIndex && a.controlIndex === b.controlIndex;
  }
  return false;
};

export const targetPathIndex = (target: DragTarget | null) => {
  if (!target) return null;
  return target.kind === "point" ? target.index : target.pathIndex;
};

export const mainPointHitRadius = (minFieldSize: number) => POINT_RADIUS / minFieldSize;
export const controlPointHitRadius = (minFieldSize: number) => CONTROL_POINT_RADIUS / minFieldSize;

const NEW_POINT_OFFSET_INCHES = 24;
// Keeps a freshly placed point clear of the wall so its whole marker stays grabbable.
const NEW_POINT_EDGE_MARGIN_INCHES = 6;

/**
 * Picks where a newly added path should land. Dropping it on the previous point
 * would hide it underneath and make it impossible to grab, so it continues in
 * the direction the auton was already travelling, turning away from the wall
 * when that direction would run off the field.
 */
export const nextPointPlacement = (points: Array<{ nx: number; ny: number }>) => {
  const previous = points[points.length - 1] ?? { nx: 0.5, ny: 0.5 };
  const beforePrevious = points[points.length - 2];
  const offset = NEW_POINT_OFFSET_INCHES / FIELD_SIZE_INCHES;
  const margin = NEW_POINT_EDGE_MARGIN_INCHES / FIELD_SIZE_INCHES;
  const travelX = beforePrevious ? previous.nx - beforePrevious.nx : 0;
  const travelY = beforePrevious ? previous.ny - beforePrevious.ny : 0;
  const travelDistance = Math.hypot(travelX, travelY);
  const [directionX, directionY] =
    travelDistance > 0.0001 ? [travelX / travelDistance, travelY / travelDistance] : [1, 0];

  // Quarter turns from the travel direction, so a blocked heading falls back to
  // the nearest one that still fits rather than jumping to the far side.
  const candidates = [
    [directionX, directionY],
    [-directionY, directionX],
    [directionY, -directionX],
    [-directionX, -directionY],
  ];
  const fitting = candidates.find(([x, y]) => {
    const nx = previous.nx + x * offset;
    const ny = previous.ny + y * offset;
    return nx >= margin && nx <= 1 - margin && ny >= margin && ny <= 1 - margin;
  });
  const [chosenX, chosenY] = fitting ?? candidates[0];

  return {
    nx: Math.max(margin, Math.min(1 - margin, previous.nx + chosenX * offset)),
    ny: Math.max(margin, Math.min(1 - margin, previous.ny + chosenY * offset)),
  };
};
