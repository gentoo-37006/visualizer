import {
  CONTROL_POINT_RADIUS,
  DEFAULT_SEGMENT_LENGTH_INCHES,
  FIELD_BORDER_WIDTH,
  FIELD_SIZE_INCHES,
  POINT_RADIUS,
} from "./plannerConstants";
import type { ControlPoint, DragTarget, FieldSize, HeadingInterpolation, Point } from "./plannerTypes";

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

export const mirrorAutonPoints = (points: Point[]): Point[] =>
  points.map((point) => {
    const mirroredPoint: Point = { ...point, nx: 1 - point.nx, ny: 1 - point.ny };

    delete mirroredPoint.poseName;
    if (point.heading !== undefined) mirroredPoint.heading = normalizeHeading(point.heading + 180);
    if (point.constantHeading !== undefined) {
      mirroredPoint.constantHeading = normalizeHeading(point.constantHeading + 180);
    }
    if (point.startHeading !== undefined) {
      mirroredPoint.startHeading = normalizeHeading(point.startHeading + 180);
    }
    if (point.endHeading !== undefined) {
      mirroredPoint.endHeading = normalizeHeading(point.endHeading + 180);
    }
    if (point.startControlOffsetNx !== undefined) {
      mirroredPoint.startControlOffsetNx = -point.startControlOffsetNx;
    }
    if (point.endControlOffsetNx !== undefined) {
      mirroredPoint.endControlOffsetNx = -point.endControlOffsetNx;
    }
    if (point.startControlOffsetNy !== undefined) {
      mirroredPoint.startControlOffsetNy = -point.startControlOffsetNy;
    }
    if (point.endControlOffsetNy !== undefined) {
      mirroredPoint.endControlOffsetNy = -point.endControlOffsetNy;
    }
    if (point.controlPoints) {
      mirroredPoint.controlPoints = point.controlPoints.map((controlPoint) => {
        const mirroredControlPoint = {
          ...controlPoint,
          nx: 1 - controlPoint.nx,
          ny: 1 - controlPoint.ny,
        };
        if (controlPoint.controlOffsetNx !== undefined) {
          mirroredControlPoint.controlOffsetNx = -controlPoint.controlOffsetNx;
        }
        if (controlPoint.controlOffsetNy !== undefined) {
          mirroredControlPoint.controlOffsetNy = -controlPoint.controlOffsetNy;
        }
        if (controlPoint.startControlOffsetNx !== undefined) {
          mirroredControlPoint.startControlOffsetNx = -controlPoint.startControlOffsetNx;
        }
        if (controlPoint.startControlOffsetNy !== undefined) {
          mirroredControlPoint.startControlOffsetNy = -controlPoint.startControlOffsetNy;
        }
        if (controlPoint.endControlOffsetNx !== undefined) {
          mirroredControlPoint.endControlOffsetNx = -controlPoint.endControlOffsetNx;
        }
        if (controlPoint.endControlOffsetNy !== undefined) {
          mirroredControlPoint.endControlOffsetNy = -controlPoint.endControlOffsetNy;
        }
        delete mirroredControlPoint.poseName;
        return mirroredControlPoint;
      });
    }

    return mirroredPoint;
  });

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

export type SplinePoint = {
  x: number;
  y: number;
  controlOffsetX?: number;
  controlOffsetY?: number;
  incomingControlOffsetX?: number;
  incomingControlOffsetY?: number;
  outgoingControlOffsetX?: number;
  outgoingControlOffsetY?: number;
};

export type CubicSplineSegment = {
  start: SplinePoint;
  control1: SplinePoint;
  control2: SplinePoint;
  end: SplinePoint;
};

export type PathSegmentGeometry = ControlPoint & { pathGeometry: "linear" | "spline" };

export type ResolvedPathSegment = {
  segment: PathSegmentGeometry;
  start: SplinePoint;
  control1?: SplinePoint;
  control2?: SplinePoint;
  end: SplinePoint;
};

export const getPathSegments = (point: Point): PathSegmentGeometry[] => [
  ...(point.controlPoints ?? []).map((segment) => ({
    ...segment,
    pathGeometry: segment.pathGeometry ?? point.pathGeometry ?? "spline",
  })),
  {
    id: point.segmentId ?? `${point.id}-segment`,
    nx: point.nx,
    ny: point.ny,
    poseName: point.poseName,
    pathGeometry: point.pathGeometry ?? "spline",
    startControlOffsetNx: point.startControlOffsetNx,
    startControlOffsetNy: point.startControlOffsetNy,
    endControlOffsetNx: point.endControlOffsetNx,
    endControlOffsetNy: point.endControlOffsetNy,
  },
];

export const applyPathSegments = (point: Point, segments: PathSegmentGeometry[]): Point => {
  const finalSegment = segments.at(-1);
  if (!finalSegment) return point;

  return {
    ...point,
    nx: finalSegment.nx,
    ny: finalSegment.ny,
    poseName: finalSegment.poseName,
    segmentId: finalSegment.id,
    pathGeometry: finalSegment.pathGeometry,
    startControlOffsetNx: finalSegment.startControlOffsetNx,
    startControlOffsetNy: finalSegment.startControlOffsetNy,
    endControlOffsetNx: finalSegment.endControlOffsetNx,
    endControlOffsetNy: finalSegment.endControlOffsetNy,
    controlPoints: segments.slice(0, -1).map((segment) => ({ ...segment })),
  };
};

export const resolvePathSegments = (
  start: Pick<Point, "nx" | "ny">,
  segments: PathSegmentGeometry[]
): ResolvedPathSegment[] => {
  const anchors: SplinePoint[] = [
    { x: start.nx, y: start.ny },
    ...segments.map((segment) => ({ x: segment.nx, y: segment.ny })),
  ];
  const joinOffsets = segments.slice(0, -1).map((leftSegment, index) => {
    const rightSegment = segments[index + 1];
    const previousAnchor = anchors[index];
    const join = anchors[index + 1];
    const nextAnchor = anchors[index + 2];
    if (leftSegment.pathGeometry === "linear") {
      return { x: (join.x - previousAnchor.x) / 3, y: (join.y - previousAnchor.y) / 3 };
    }
    if (rightSegment.pathGeometry === "linear") {
      return { x: (nextAnchor.x - join.x) / 3, y: (nextAnchor.y - join.y) / 3 };
    }
    return {
      x: leftSegment.endControlOffsetNx
        ?? rightSegment.startControlOffsetNx
        ?? (nextAnchor.x - previousAnchor.x) / 6,
      y: leftSegment.endControlOffsetNy
        ?? rightSegment.startControlOffsetNy
        ?? (nextAnchor.y - previousAnchor.y) / 6,
    };
  });
  return segments.map((segment, index) => {
    const currentStart = anchors[index];
    const end = { x: segment.nx, y: segment.ny };
    const startOffset = index > 0
      ? joinOffsets[index - 1]
      : {
          x: segment.startControlOffsetNx ?? (end.x - currentStart.x) / 3,
          y: segment.startControlOffsetNy ?? (end.y - currentStart.y) / 3,
        };
    const endOffset = index < segments.length - 1
      ? joinOffsets[index]
      : {
          x: segment.endControlOffsetNx ?? (end.x - currentStart.x) / 3,
          y: segment.endControlOffsetNy ?? (end.y - currentStart.y) / 3,
        };
    const resolved: ResolvedPathSegment = segment.pathGeometry === "linear"
      ? { segment, start: currentStart, end }
      : {
          segment,
          start: currentStart,
          control1: {
            x: currentStart.x + startOffset.x,
            y: currentStart.y + startOffset.y,
          },
          control2: {
            x: end.x - endOffset.x,
            y: end.y - endOffset.y,
          },
          end,
        };
    return resolved;
  });
};

export const getPathEndTangent = (
  start: Pick<Point, "nx" | "ny">,
  point: Point
): SplinePoint | null => {
  const resolved = resolvePathSegments(start, getPathSegments(point));
  for (let index = resolved.length - 1; index >= 0; index--) {
    const segment = resolved[index];
    const tangent = segment.control2
      ? { x: segment.end.x - segment.control2.x, y: segment.end.y - segment.control2.y }
      : {
          x: (segment.end.x - segment.start.x) / 3,
          y: (segment.end.y - segment.start.y) / 3,
        };
    if (Math.hypot(tangent.x, tangent.y) > 1e-9) return tangent;
  }
  return null;
};

export const headingToNormalizedTangent = (heading: number): SplinePoint => {
  const radians = (heading * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

export const createForwardPathSegment = (
  start: Pick<ControlPoint, "nx" | "ny">,
  tangent: SplinePoint,
  pathGeometry: "linear" | "spline",
  id: string,
  preferredStartTangent?: SplinePoint | null
): PathSegmentGeometry => {
  const magnitude = Math.hypot(tangent.x, tangent.y);
  const direction = magnitude > 1e-9
    ? { x: tangent.x / magnitude, y: tangent.y / magnitude }
    : { x: 1, y: 0 };
  const xLimit = direction.x > 1e-9
    ? (1 - start.nx) / direction.x
    : direction.x < -1e-9
      ? (0 - start.nx) / direction.x
      : Number.POSITIVE_INFINITY;
  const yLimit = direction.y > 1e-9
    ? (1 - start.ny) / direction.y
    : direction.y < -1e-9
      ? (0 - start.ny) / direction.y
      : Number.POSITIVE_INFINITY;
  const preferredTangentLength = preferredStartTangent
    ? Math.hypot(preferredStartTangent.x, preferredStartTangent.y)
    : 0;
  const desiredLength = Math.max(
    DEFAULT_SEGMENT_LENGTH_INCHES / FIELD_SIZE_INCHES,
    preferredTangentLength
  );
  const length = Math.max(0, Math.min(desiredLength, xLimit, yLimit));
  const endOffsetX = direction.x * length / 3;
  const endOffsetY = direction.y * length / 3;
  const preferredStartLength = preferredStartTangent
    ? Math.min(preferredTangentLength, length)
    : length / 3;
  const startOffsetX = direction.x * preferredStartLength;
  const startOffsetY = direction.y * preferredStartLength;

  return {
    id,
    nx: Math.max(0, Math.min(1, start.nx + direction.x * length)),
    ny: Math.max(0, Math.min(1, start.ny + direction.y * length)),
    pathGeometry,
    ...(pathGeometry === "spline"
      ? {
          startControlOffsetNx: startOffsetX,
          startControlOffsetNy: startOffsetY,
          endControlOffsetNx: endOffsetX,
          endControlOffsetNy: endOffsetY,
        }
      : {}),
  };
};

export const isSegmentControlLockedByLinearNeighbor = (
  segments: PathSegmentGeometry[],
  segmentIndex: number,
  control: "start" | "end"
) => control === "start"
  ? segments[segmentIndex - 1]?.pathGeometry === "linear"
  : segments[segmentIndex + 1]?.pathGeometry === "linear";

export const samplePathSegments = (
  start: Pick<Point, "nx" | "ny">,
  segments: PathSegmentGeometry[],
  samplesPerSegment = 32
): SplinePoint[] =>
  resolvePathSegments(start, segments).flatMap((resolved, segmentIndex) =>
    Array.from({ length: samplesPerSegment + 1 }, (_, sampleIndex) => sampleIndex)
      .filter((sampleIndex) => segmentIndex === 0 || sampleIndex > 0)
      .map((sampleIndex) => {
        const t = sampleIndex / samplesPerSegment;
        if (!resolved.control1 || !resolved.control2) {
          return {
            x: resolved.start.x + (resolved.end.x - resolved.start.x) * t,
            y: resolved.start.y + (resolved.end.y - resolved.start.y) * t,
          };
        }
        return evaluateCubicSplineSegment(
          {
            start: resolved.start,
            control1: resolved.control1,
            control2: resolved.control2,
            end: resolved.end,
          },
          t
        );
      })
  );

export const getCubicSplineJoinControls = (
  points: SplinePoint[],
  joinIndex: number
): { incoming: SplinePoint; outgoing: SplinePoint } | null => {
  if (joinIndex <= 0 || joinIndex >= points.length - 1) return null;
  const join = points[joinIndex];
  const previous = points[joinIndex - 1];
  const next = points[joinIndex + 1];
  const offsetX = join.controlOffsetX ?? (next.x - previous.x) / 6;
  const offsetY = join.controlOffsetY ?? (next.y - previous.y) / 6;

  return {
    incoming: { x: join.x - offsetX, y: join.y - offsetY },
    outgoing: { x: join.x + offsetX, y: join.y + offsetY },
  };
};

/**
 * Builds a smooth cubic chain through every supplied point. Intermediate
 * points are nodes on the curve, not Bézier handles. Endpoint extrapolation
 * keeps a two-point path linear and gives the chain a natural end tangent.
 */
export const createCubicSplineSegments = (points: SplinePoint[]): CubicSplineSegment[] => {
  if (points.length < 2) return [];

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const startControls = getCubicSplineJoinControls(points, index);
    const endControls = getCubicSplineJoinControls(points, index + 1);
    const linearControl1 = {
      x: start.x + (end.x - start.x) / 3,
      y: start.y + (end.y - start.y) / 3,
    };
    const linearControl2 = {
      x: start.x + ((end.x - start.x) * 2) / 3,
      y: start.y + ((end.y - start.y) * 2) / 3,
    };

    return {
      start,
      control1:
        startControls?.outgoing ??
        (start.outgoingControlOffsetX !== undefined && start.outgoingControlOffsetY !== undefined
          ? {
              x: start.x + start.outgoingControlOffsetX,
              y: start.y + start.outgoingControlOffsetY,
            }
          : linearControl1),
      control2:
        endControls?.incoming ??
        (end.incomingControlOffsetX !== undefined && end.incomingControlOffsetY !== undefined
          ? {
              x: end.x - end.incomingControlOffsetX,
              y: end.y - end.incomingControlOffsetY,
            }
          : linearControl2),
      end,
    };
  });
};

export const evaluateCubicSplineSegment = (segment: CubicSplineSegment, t: number): SplinePoint => {
  const inverseT = 1 - t;
  const startWeight = inverseT * inverseT * inverseT;
  const control1Weight = 3 * inverseT * inverseT * t;
  const control2Weight = 3 * inverseT * t * t;
  const endWeight = t * t * t;

  return {
    x:
      segment.start.x * startWeight +
      segment.control1.x * control1Weight +
      segment.control2.x * control2Weight +
      segment.end.x * endWeight,
    y:
      segment.start.y * startWeight +
      segment.control1.y * control1Weight +
      segment.control2.y * control2Weight +
      segment.end.y * endWeight,
  };
};

const evaluateCubicSplineDerivative = (segment: CubicSplineSegment, t: number): SplinePoint => {
  const inverseT = 1 - t;
  return {
    x:
      3 * inverseT * inverseT * (segment.control1.x - segment.start.x) +
      6 * inverseT * t * (segment.control2.x - segment.control1.x) +
      3 * t * t * (segment.end.x - segment.control2.x),
    y:
      3 * inverseT * inverseT * (segment.control1.y - segment.start.y) +
      6 * inverseT * t * (segment.control2.y - segment.control1.y) +
      3 * t * t * (segment.end.y - segment.control2.y),
  };
};

export const sampleCubicSpline = (points: SplinePoint[], samplesPerSegment = 32): SplinePoint[] => {
  const segments = createCubicSplineSegments(points);
  if (segments.length === 0) return points.slice(0, 1);

  return segments.flatMap((segment, segmentIndex) =>
    Array.from({ length: samplesPerSegment + 1 }, (_, sampleIndex) => sampleIndex)
      .filter((sampleIndex) => segmentIndex === 0 || sampleIndex > 0)
      .map((sampleIndex) => evaluateCubicSplineSegment(segment, sampleIndex / samplesPerSegment))
  );
};

export const appendCubicPathJoin = (
  start: Pick<Point, "nx" | "ny">,
  joins: ControlPoint[],
  end: Pick<
    Point,
    | "nx"
    | "ny"
    | "startControlOffsetNx"
    | "startControlOffsetNy"
    | "endControlOffsetNx"
    | "endControlOffsetNy"
  >,
  id: string
): ControlPoint[] => {
  const knots: SplinePoint[] = [
    {
      x: start.nx,
      y: start.ny,
      outgoingControlOffsetX: end.startControlOffsetNx,
      outgoingControlOffsetY: end.startControlOffsetNy,
    },
    ...joins.map((join) => ({
      x: join.nx,
      y: join.ny,
      controlOffsetX: join.controlOffsetNx,
      controlOffsetY: join.controlOffsetNy,
    })),
    {
      x: end.nx,
      y: end.ny,
      incomingControlOffsetX: end.endControlOffsetNx,
      incomingControlOffsetY: end.endControlOffsetNy,
    },
  ];
  const finalSegment = createCubicSplineSegments(knots).at(-1);
  const position = finalSegment
    ? evaluateCubicSplineSegment(finalSegment, 0.5)
    : { x: end.nx, y: end.ny };
  const derivative = finalSegment
    ? evaluateCubicSplineDerivative(finalSegment, 0.5)
    : { x: end.nx - start.nx, y: end.ny - start.ny };
  return [
    ...joins,
    {
      id,
      nx: position.x,
      ny: position.y,
      controlOffsetNx: derivative.x / 6,
      controlOffsetNy: derivative.y / 6,
    },
  ];
};

export const createSplinePath = (
  start: SplinePoint,
  joins: SplinePoint[],
  end: SplinePoint
) => {
  const segments = createCubicSplineSegments([start, ...joins, end]);
  if (segments.length === 0) return "";

  return segments
    .map(
      (segment, index) =>
        `${index === 0 ? `M ${segment.start.x.toFixed(2)} ${segment.start.y.toFixed(2)} ` : ""}` +
        `C ${segment.control1.x.toFixed(2)} ${segment.control1.y.toFixed(2)} ` +
        `${segment.control2.x.toFixed(2)} ${segment.control2.y.toFixed(2)} ` +
        `${segment.end.x.toFixed(2)} ${segment.end.y.toFixed(2)}`
    )
    .join(" ");
};

export const isSameTarget = (a: DragTarget | null, b: DragTarget | null) => {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") return a.index === b.index;
  if (a.kind === "segmentEnd" && b.kind === "segmentEnd") {
    return a.pathIndex === b.pathIndex && a.segmentIndex === b.segmentIndex;
  }
  if (a.kind === "segmentControl" && b.kind === "segmentControl") {
    return (
      a.pathIndex === b.pathIndex &&
      a.segmentIndex === b.segmentIndex &&
      a.control === b.control
    );
  }
  return false;
};

export const targetPathIndex = (target: DragTarget | null) => {
  if (!target) return null;
  return target.kind === "point" ? target.index : target.pathIndex;
};

export const mainPointHitRadius = (minFieldSize: number) => POINT_RADIUS / minFieldSize;
export const controlPointHitRadius = (minFieldSize: number) => CONTROL_POINT_RADIUS / minFieldSize;
