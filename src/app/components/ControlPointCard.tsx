"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import styles from "../page.module.css";
import { isNumericDraft } from "../plannerUtils";

type ControlPointCardProps = {
  index: number;
  x: number;
  y: number;
  onChange: (axis: "x" | "y", val: string) => void;
  onEditStart: () => void;
  onEditCommit: () => void;
  canDelete: boolean;
  onDelete: () => void;
};

export function ControlPointCard({
  index,
  x,
  y,
  onChange,
  onEditStart,
  onEditCommit,
  canDelete,
  onDelete,
}: ControlPointCardProps) {
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | null>(null);
  const [draftX, setDraftX] = useState("");
  const [draftY, setDraftY] = useState("");

  const startEditing = (axis: "x" | "y") => {
    setEditingAxis(axis);
    onEditStart();
    if (axis === "x") {
      setDraftX(x.toFixed(1));
    } else {
      setDraftY(y.toFixed(1));
    }
  };

  const updateDraft = (axis: "x" | "y", val: string) => {
    if (!isNumericDraft(val)) return;

    if (axis === "x") {
      setDraftX(val);
    } else {
      setDraftY(val);
    }
    onChange(axis, val);
  };

  const commitEdit = (axis: "x" | "y", val: string) => {
    onChange(axis, val);
    onEditCommit();
    setEditingAxis(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, axis: "x" | "y", val: string) => {
    if (e.key === "Enter") {
      commitEdit(axis, val);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) return;
    onDelete();
  };

  return (
    <div className={styles.controlPointCard}>
      <div className={styles.controlPointTitleRow}>
        <span className={styles.controlPointTitle}>Control Point {index + 1}</span>
        <span className={styles.deleteAction}>
          <button
            className={`${styles.iconButton} ${styles.deleteButton} ${canDelete ? styles.deleteArmed : ""}`}
            onClick={handleDeleteClick}
            aria-label={`Delete control point ${index + 1}`}
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
      </div>
      <div className={styles.controlPointInputs}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>X (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "x" ? draftX : x.toFixed(1)}
            onFocus={() => startEditing("x")}
            onChange={(e) => updateDraft("x", e.target.value)}
            onBlur={(e) => commitEdit("x", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "x", e.currentTarget.value)}
          />
        </div>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Y (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "y" ? draftY : y.toFixed(1)}
            onFocus={() => startEditing("y")}
            onChange={(e) => updateDraft("y", e.target.value)}
            onBlur={(e) => commitEdit("y", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "y", e.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}
