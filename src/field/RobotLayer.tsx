import { robotFrame, type FieldPose, type RobotSize, type ViewportGeometry } from "./geometry";

export function RobotLayer({ pose, size, viewport, image, outOfBounds = false }: {
  pose: FieldPose;
  size: RobotSize;
  viewport: ViewportGeometry;
  image: string;
  outOfBounds?: boolean;
}) {
  const frame = robotFrame(pose, size, viewport);
  return (
    <g data-layer="robot" transform={`rotate(${pose.heading} ${frame.centerX} ${frame.centerY})`} pointerEvents="none">
      <image href={image} x={frame.x} y={frame.y} width={frame.width} height={frame.height} preserveAspectRatio="none" opacity="0.92" />
      {outOfBounds && <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="2"><title>The robot is through the field wall at this point in the path</title></rect>}
    </g>
  );
}
