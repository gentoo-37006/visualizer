"use client";

import { useState, type KeyboardEvent } from "react";
import styles from "../page.module.css";
import { isNumericDraft } from "../plannerUtils";

type ControlPointCardProps = {
  index: number;
  x: number;
  y: number;
  onChange: (axis: "x" | "y", val: string) => void;
  onEditStart: () => void;
  onEditCommit: () => void;
};

export function ControlPointCard({
  index,
  x,
  y,
  onChange,
  onEditStart,
  onEditCommit,
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

  return (
    <div className={styles.controlPointCard}>
      <div className={styles.controlPointTitleRow}>
        <span className={styles.controlPointTitle}>Control Point {index + 1}</span>
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
