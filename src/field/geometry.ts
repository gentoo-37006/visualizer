export const FIELD_SIZE_INCHES = 144;

export type FieldPose = { x: number; y: number; heading: number };
export type RobotSize = { width: number; length: number };
export type ViewportGeometry = { width: number; height: number; padding: number; border: number };
export type FieldPosition = Pick<FieldPose, "x" | "y">;
export type FieldCurve = {
  start: FieldPosition;
  end: FieldPosition;
  control1?: FieldPosition;
  control2?: FieldPosition;
};
export type FieldPath = { id: string; color: string; curves: FieldCurve[]; opacity?: number };

export function fieldToViewport(position: FieldPosition, viewport: ViewportGeometry) {
  return {
    x: viewport.padding + viewport.border + (position.x / FIELD_SIZE_INCHES + 0.5) * (viewport.width - 2 * viewport.border),
    y: viewport.padding + viewport.border + (0.5 - position.y / FIELD_SIZE_INCHES) * (viewport.height - 2 * viewport.border),
  };
}

export function robotFrame(pose: FieldPose, size: RobotSize, viewport: ViewportGeometry) {
  const center = fieldToViewport(pose, viewport);
  const width = size.width / FIELD_SIZE_INCHES * (viewport.width - 2 * viewport.border);
  const height = size.length / FIELD_SIZE_INCHES * (viewport.height - 2 * viewport.border);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height, centerX: center.x, centerY: center.y };
}
