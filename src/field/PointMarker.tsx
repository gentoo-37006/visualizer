import { POINT_RADIUS } from "../app/plannerConstants";

export function PointMarker({ x, y, color, label, hovered = false }: { x: number; y: number; color: string; label?: number; hovered?: boolean }) {
  return <>
    <circle cx={x} cy={y} r={POINT_RADIUS} fill={color} stroke={hovered ? "white" : "transparent"} strokeWidth="2" />
    {label !== undefined && <text x={x} y={y} fill="#111827" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{label}</text>}
  </>;
}

export function ControlMarker({ x, y, color, hovered = false, locked = false }: { x: number; y: number; color: string; hovered?: boolean; locked?: boolean }) {
  return <circle cx={x} cy={y} r="5" fill="#262626" stroke={hovered ? "white" : color} strokeWidth="2" opacity={locked ? 0.55 : 1} />;
}

type Position = { x: number; y: number };
export function SplineGuides({ start, end, control1, control2, color }: { start: Position; end: Position; control1: Position; control2: Position; color: string }) {
  return <g pointerEvents="none">
    <line x1={start.x} y1={start.y} x2={control1.x} y2={control1.y} stroke={color} strokeWidth="1.5" opacity="0.9" />
    <line x1={control2.x} y1={control2.y} x2={end.x} y2={end.y} stroke={color} strokeWidth="1.5" opacity="0.9" />
  </g>;
}
