"use client";

import { Select } from "./Select";

import { type MouseEvent } from "react";
import styles from "../page.module.css";
import type { PathGeometry } from "../plannerTypes";
import { PosePicker, type PoseSelection } from "./PosePicker";
import type { SavedPose } from "../kotlinAutonFile";

type SegmentCardProps = {
  index: number;
  pathGeometry: PathGeometry;
  x: number;
  y: number;
  poseName?: string;
  savedPoses: SavedPose[];
  onPoseChange: (pose: PoseSelection) => void;
  onPathGeometryChange: (pathGeometry: PathGeometry) => void;
  onChange: (axis: "x" | "y", val: string) => void;
  onEditStart: () => void;
  onEditCommit: () => void;
  canDelete: boolean;
  canRemove: boolean;
  onDelete: () => void;
};

export function SegmentCard({
  index,
  pathGeometry,
  x,
  y,
  poseName,
  savedPoses,
  onPoseChange,
  onPathGeometryChange,
  canDelete,
  canRemove,
  onDelete,
}: SegmentCardProps) {
  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey || !canRemove) return;
    onDelete();
  };

  return (
    <div className={styles.controlPointCard}>
      <div className={styles.controlPointTitleRow}>
        <span className={styles.controlPointTitle}>Segment {index + 1}</span>
        {canRemove && (
          <span className={styles.deleteAction}>
            <button
              className={`${styles.iconButton} ${styles.deleteButton} ${canDelete ? styles.deleteArmed : ""}`}
              onClick={handleDeleteClick}
              aria-label={`Delete segment ${index + 1}`}
              aria-describedby={!canDelete ? `control-point-delete-tooltip-${index}` : undefined}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
            {!canDelete && (
              <span id={`control-point-delete-tooltip-${index}`} className={styles.deleteTooltip} role="tooltip">
                Hold Shift to delete
              </span>
            )}
          </span>
        )}
      </div>
      <div className={styles.controlPointInputs}>
        <div className={styles.selectGroup}>
          <label className={styles.inputLabel}>Type</label>
          <Select
            className={styles.selectField}
            value={pathGeometry}
            onChange={(value) => onPathGeometryChange(value as PathGeometry)}
            aria-label={`Segment ${index + 1} type`}
          >
            <option value="linear">Linear</option>
            <option value="spline">Spline</option>
          </Select>
        </div>
        <div className={styles.poseInputGroup}><span className={styles.inputLabel}>Pose (in)</span><PosePicker x={x} y={y} poseName={poseName} savedPoses={savedPoses} label={`Segment ${index + 1} pose`} onChange={onPoseChange} /></div>

      </div>
    </div>
  );
}
