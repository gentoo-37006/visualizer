"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import Image from "next/image";
import styles from "./page.module.css";

// --- Types & Constants ---
type Point = {
  id: string;
  nx: number; // Normalized x (0 to 1)
  ny: number; // Normalized y (0 to 1)
  color: string;
};

const FIELD_SIZE_INCHES = 144;
const POINT_DIAMETER = 16;
const BORDER_WIDTH = 3;

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const randomColor = () => {
  const min = 120;
  const range = 256 - min;
  const r = Math.floor(Math.random() * range) + min;
  const g = Math.floor(Math.random() * range) + min;
  const b = Math.floor(Math.random() * range) + min;
  return `rgb(${r}, ${g}, ${b})`;
};

const toFieldCoords = (nx: number, ny: number) => {
  const x = (nx - 0.5) * FIELD_SIZE_INCHES;
  const y = (0.5 - ny) * FIELD_SIZE_INCHES;
  return { x, y };
};

const toNormalizedCoords = (x: number, y: number) => {
  let nx = x / FIELD_SIZE_INCHES + 0.5;
  let ny = 0.5 - y / FIELD_SIZE_INCHES;
  // clamp
  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));
  return { nx, ny };
};

export default function PathPlannerPage() {
  const [points, setPoints] = useState<Point[]>([
    { id: "init-point", nx: 0.5, ny: 0.5, color: "rgb(59, 130, 246)" },
  ]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // --- Handlers ---
  const handleAddPoint = () => {
    const seed = points.length > 0 ? points[points.length - 1] : { nx: 0.5, ny: 0.5 };
    setPoints([...points, { id: generateId(), nx: seed.nx, ny: seed.ny, color: randomColor() }]);
  };

  const handleRemovePoint = (index: number) => {
    setPoints(points.filter((_, i) => i !== index));
    if (activeIndex === index) setActiveIndex(null);
    if (hoverIndex === index) setHoverIndex(null);
  };

  const updatePoint = (index: number, nx: number, ny: number) => {
    const newPoints = [...points];
    newPoints[index] = { ...newPoints[index], nx, ny };
    setPoints(newPoints);
  };

  const handleCoordChange = (index: number, axis: "x" | "y", value: string) => {
    const p = points[index];
    const currentField = toFieldCoords(p.nx, p.ny);
    
    // Allow typing by just storing the value if it's invalid temporarily, 
    // but here we just parse it. A better UX would use local state for inputs.
    const num = parseFloat(value);
    if (isNaN(num)) return; // Simple handling, could be improved

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    updatePoint(index, nx, ny);
  };

  // --- Pointer Events for SVG ---
  const getPointerNormalized = (e: React.PointerEvent<SVGSVGElement> | PointerEvent) => {
    if (!svgRef.current) return { nx: 0, ny: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    
    // Calculate the inner field size (subtracting padding)
    const paddingOffset = POINT_DIAMETER / 2 + BORDER_WIDTH;
    const innerSize = rect.width - paddingOffset * 2;
    
    // Pointer relative to the inner field
    const localX = e.clientX - rect.left - paddingOffset;
    const localY = e.clientY - rect.top - paddingOffset;
    
    let nx = localX / innerSize;
    let ny = localY / innerSize;
    
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    
    return { nx, ny };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (hoverIndex !== null) {
      setIsDragging(true);
      setActiveIndex(hoverIndex);
      // Optional: allow set pointer capture for better dragging outside
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging && activeIndex !== null) {
      const { nx, ny } = getPointerNormalized(e);
      updatePoint(activeIndex, nx, ny);
    } else {
      // Hit testing for hover
      if (!svgRef.current) return;
      const { nx, ny } = getPointerNormalized(e);
      
      const paddingOffset = POINT_DIAMETER / 2 + BORDER_WIDTH;
      const innerSize = svgRef.current.getBoundingClientRect().width - paddingOffset * 2;
      const hitRadiusNormalized = (POINT_DIAMETER / 2) / innerSize;

      let hit = null;
      for (let i = points.length - 1; i >= 0; i--) {
        const dx = points[i].nx - nx;
        const dy = points[i].ny - ny;
        if (Math.sqrt(dx * dx + dy * dy) <= hitRadiusNormalized) {
          hit = i;
          break;
        }
      }
      setHoverIndex(hit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    if (svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.fieldWrapper}>
        <div className={styles.fieldContainer}>
          <Image
            src="/fields/decode.webp"
            alt="Field Map"
            fill
            priority
            sizes="(max-width: 768px) 100vw, (max-height: 100vh) 100vh, 1000px"
            className={styles.fieldImage}
          />
          <svg
            ref={svgRef}
            className={styles.svgOverlay}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => { if (!isDragging) setHoverIndex(null); }}
            style={{ 
              cursor: isDragging ? 'grabbing' : (hoverIndex !== null ? 'pointer' : 'crosshair') 
            }}
          >
            {/* Draw Lines */}
            {points.map((p, i) => {
              if (i === points.length - 1) return null;
              const nextP = points[i + 1];
              // Map normalized to SVG viewbox percentages (using calc to handle padding)
              const padding = `${POINT_DIAMETER / 2 + BORDER_WIDTH}px`;
              return (
                <line
                  key={`line-${p.id}`}
                  x1={`calc(${padding} + ${p.nx * 100}% - ${p.nx} * ${padding} * 2)`}
                  y1={`calc(${padding} + ${p.ny * 100}% - ${p.ny} * ${padding} * 2)`}
                  x2={`calc(${padding} + ${nextP.nx * 100}% - ${nextP.nx} * ${padding} * 2)`}
                  y2={`calc(${padding} + ${nextP.ny * 100}% - ${nextP.ny} * ${padding} * 2)`}
                  stroke={nextP.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Draw Points */}
            {points.map((p, i) => {
              const padding = `${POINT_DIAMETER / 2 + BORDER_WIDTH}px`;
              const cx = `calc(${padding} + ${p.nx * 100}% - ${p.nx} * ${padding} * 2)`;
              const cy = `calc(${padding} + ${p.ny * 100}% - ${p.ny} * ${padding} * 2)`;
              const isHovered = hoverIndex === i;

              return (
                <g key={`point-${p.id}`}>
                  {isHovered && (
                    <circle
                      cx={cx}
                      cy={`calc(${cy} + 2px)`}
                      r={POINT_DIAMETER / 2}
                      fill="rgba(0,0,0,0.45)"
                      filter="blur(4px)"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={POINT_DIAMETER / 2}
                    fill={p.color}
                    stroke={isHovered ? "white" : "transparent"}
                    strokeWidth="2"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.sidebarTitle}>Path Planner</h1>
        </div>
        
        <div className={styles.pointsList}>
          {points.map((p, i) => {
            const coords = toFieldCoords(p.nx, p.ny);
            return (
              <PointCard
                key={p.id}
                index={i}
                color={p.color}
                x={coords.x}
                y={coords.y}
                isActive={hoverIndex === i || activeIndex === i}
                onChange={(axis, val) => handleCoordChange(i, axis, val)}
                onDelete={() => handleRemovePoint(i)}
              />
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <button className={styles.addButton} onClick={handleAddPoint}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Point
          </button>
        </div>
      </aside>
    </main>
  );
}

// --- Subcomponents ---

function PointCard({
  index,
  color,
  x,
  y,
  isActive,
  onChange,
  onDelete
}: {
  index: number;
  color: string;
  x: number;
  y: number;
  isActive: boolean;
  onChange: (axis: "x" | "y", val: string) => void;
  onDelete: () => void;
}) {
  // Using local state for inputs so typing isn't completely broken by external updates
  // but we sync with props when they change
  const [localX, setLocalX] = useState(x.toFixed(1));
  const [localY, setLocalY] = useState(y.toFixed(1));

  useEffect(() => {
    // Only update local state if the user is NOT actively typing
    // Actually, simple sync:
    setLocalX(x.toFixed(1));
    setLocalY(y.toFixed(1));
  }, [x, y]);

  const handleBlur = (axis: "x" | "y", val: string) => {
    onChange(axis, val);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, axis: "x" | "y", val: string) => {
    if (e.key === "Enter") {
      onChange(axis, val);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div 
      className={`${styles.pointCard} ${isActive ? styles.active : ''}`}
      style={{ '--point-color': color } as React.CSSProperties}
    >
      <div className={styles.pointCardHeader}>
        <span className={styles.pointTitle}>Point {index + 1}</span>
        {index > 0 && (
          <button className={styles.deleteButton} onClick={onDelete} aria-label="Delete point">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        )}
      </div>
      <div className={styles.coordRow}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>X (in)</label>
          <input
            type="text"
            className={styles.inputField}
            value={localX}
            onChange={(e) => setLocalX(e.target.value)}
            onBlur={(e) => handleBlur("x", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "x", e.currentTarget.value)}
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Y (in)</label>
          <input
            type="text"
            className={styles.inputField}
            value={localY}
            onChange={(e) => setLocalY(e.target.value)}
            onBlur={(e) => handleBlur("y", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "y", e.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}
