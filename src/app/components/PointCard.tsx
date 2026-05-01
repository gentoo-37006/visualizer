"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import styles from "../page.module.css";
import type { HeadingInterpolation, PathHeadingField } from "../plannerTypes";
import { isKotlinIdentifierDraft, isNumericDraft } from "../plannerUtils";
import { ControlPointCard } from "./ControlPointCard";

type PointCardProps = {
  index: number;
  name: string;
  poseName?: string;
  color: string;
  locked: boolean;
  hidden: boolean;
  x: number;
  y: number;
  heading?: number;
  headingMode: HeadingInterpolation;
  constantHeading: number;
  startHeading: number;
  endHeading: number;
  controlPoints: Array<{ id: string; x: number; y: number }>;
  controlPointCount: number;
  controlsExpanded: boolean;
  isActive: boolean;
  onChange: (axis: "x" | "y", val: string) => void;
  startPoseOptions?: Array<{ name: string }>;
  onStartPoseSelect?: (name: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onRename?: (name: string) => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onHeadingChange?: (val: string) => void;
  onInterpolationChange?: (mode: HeadingInterpolation) => void;
  onPathHeadingChange?: (field: PathHeadingField, val: string) => void;
  onToggleLocked: () => void;
  onToggleHidden: (hideOthers: boolean) => void;
  onToggleControlsExpanded?: () => void;
  onAddControlPoint?: () => void;
  onControlPointChange?: (controlIndex: number, axis: "x" | "y", val: string) => void;
  onControlPointEditStart: () => void;
  onControlPointEditCommit: () => void;
  canDelete: boolean;
  onDelete: () => void;
};

export function PointCard({
  index,
  name,
  poseName,
  color,
  locked,
  hidden,
  x,
  y,
  heading,
  headingMode,
  constantHeading,
  startHeading,
  endHeading,
  controlPoints,
  controlPointCount,
  controlsExpanded,
  isActive,
  onChange,
  startPoseOptions = [],
  onStartPoseSelect,
  onPositionEditStart,
  onPositionEditCommit,
  onRename,
  onNameEditStart,
  onNameEditCommit,
  onHeadingChange,
  onInterpolationChange,
  onPathHeadingChange,
  onToggleLocked,
  onToggleHidden,
  onToggleControlsExpanded,
  onAddControlPoint,
  onControlPointChange,
  onControlPointEditStart,
  onControlPointEditCommit,
  canDelete,
  onDelete,
}: PointCardProps) {
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | "heading" | PathHeadingField | null>(null);
  const [draftX, setDraftX] = useState("");
  const [draftY, setDraftY] = useState("");
  const [draftHeading, setDraftHeading] = useState("");
  const [draftPathHeading, setDraftPathHeading] = useState("");
  const [draftName, setDraftName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const startEditing = (axis: "x" | "y" | "heading" | PathHeadingField) => {
    setEditingAxis(axis);
    if (axis === "x") {
      onPositionEditStart();
      setDraftX(x.toFixed(1));
    } else if (axis === "y") {
      onPositionEditStart();
      setDraftY(y.toFixed(1));
    } else if (axis === "heading") {
      setDraftHeading((heading ?? 0).toFixed(1));
    } else {
      const value =
        axis === "constant"
          ? constantHeading
          : axis === "start"
            ? startHeading
            : endHeading;
      setDraftPathHeading(value.toFixed(1));
    }
  };

  const commitEdit = (axis: "x" | "y" | "heading" | PathHeadingField, val: string) => {
    if (axis === "heading") {
      onHeadingChange?.(val);
    } else if (axis === "constant" || axis === "start" || axis === "end") {
      onPathHeadingChange?.(axis, val);
    } else {
      onChange(axis, val);
      onPositionEditCommit();
    }
    setEditingAxis(null);
  };

  const updateCoordinateDraft = (axis: "x" | "y", val: string) => {
    if (!isNumericDraft(val)) return;

    if (axis === "x") {
      setDraftX(val);
    } else {
      setDraftY(val);
    }

    onChange(axis, val);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    axis: "x" | "y" | "heading" | PathHeadingField,
    val: string
  ) => {
    if (e.key === "Enter") {
      commitEdit(axis, val);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) return;
    onDelete();
  };

  const handleVisibilityClick = (event: MouseEvent<HTMLButtonElement>) => {
    onToggleHidden(event.shiftKey);
  };

  const handleNameFocus = () => {
    onNameEditStart();
    setIsEditingName(true);
    setDraftName(name);
  };

  const handleNameBlur = () => {
    const trimmedName = draftName.trim();
    onRename?.(trimmedName || `path${index}`);
    onNameEditCommit();
    setIsEditingName(false);
  };

  return (
    <div
      className={`${styles.pointCard} ${isActive ? styles.active : ""}`}
      style={{ "--point-color": color } as React.CSSProperties}
    >
      <div className={styles.pointCardHeader}>
        {index === 0 ? (
          <span className={styles.pointTitle}>Start Pose</span>
        ) : (
          <input
            className={styles.pathNameInput}
            maxLength={32}
            value={isEditingName ? draftName : name}
            onFocus={handleNameFocus}
            onChange={(e) => {
              if (!isKotlinIdentifierDraft(e.target.value)) return;
              setDraftName(e.target.value);
              onRename?.(e.target.value);
            }}
            onBlur={handleNameBlur}
            aria-label={`Rename path ${index}`}
          />
        )}
        <div className={styles.cardActions}>
          {index > 0 && (
            <span className={styles.visibilityAction}>
            <button
              className={`${styles.iconButton} ${styles.visibilityButton} ${hidden ? styles.hiddenButton : ""}`}
              onClick={handleVisibilityClick}
              aria-label={hidden ? "Show path" : "Hide path"}
              aria-describedby={canDelete ? `hide-tooltip-${index}` : undefined}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a20.29 20.29 0 0 1 4.23-5.94"></path>
                  <path d="M9.9 4.24A10.45 10.45 0 0 1 12 4c5 0 9.27 3.11 11 8a20.77 20.77 0 0 1-2.24 3.64"></path>
                  <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
            {canDelete && (
              <span id={`hide-tooltip-${index}`} className={styles.visibilityTooltip} role="tooltip">
                Hide other paths
              </span>
            )}
            </span>
          )}
          <button
            className={`${styles.iconButton} ${styles.lockButton} ${locked ? styles.lockedButton : ""}`}
            onClick={onToggleLocked}
            disabled={hidden}
            aria-label={locked ? "Locked" : "Unlocked"}
            title={hidden ? "Show path before changing lock" : locked ? "Locked" : "Unlocked"}
          >
            {!locked ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            )}
          </button>
          {index > 0 && (
            <span className={styles.deleteAction}>
              <button
                className={`${styles.iconButton} ${styles.deleteButton} ${canDelete ? styles.deleteArmed : ""}`}
                onClick={handleDeleteClick}
                aria-label="Delete path"
                aria-describedby={!canDelete ? `delete-tooltip-${index}` : undefined}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
              {!canDelete && (
                <span id={`delete-tooltip-${index}`} className={styles.deleteTooltip} role="tooltip">
                  Hold Shift to delete
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className={styles.coordRow}>
        {index === 0 && (
          <div className={styles.selectGroup}>
            <label className={styles.inputLabel}>Saved Pose</label>
            <select
              className={styles.selectField}
              value={poseName ?? ""}
              onChange={(e) => onStartPoseSelect?.(e.target.value)}
            >
              <option value="">Manual</option>
              {startPoseOptions.map((startPose) => (
                <option key={startPose.name} value={startPose.name}>
                  {startPose.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>X (in)</label>
          <input
            type="text"
            inputMode="decimal"
            className={styles.inputField}
            value={editingAxis === "x" ? draftX : x.toFixed(1)}
            onFocus={() => startEditing("x")}
            onChange={(e) => updateCoordinateDraft("x", e.target.value)}
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
            onChange={(e) => updateCoordinateDraft("y", e.target.value)}
            onBlur={(e) => commitEdit("y", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, "y", e.currentTarget.value)}
          />
        </div>
        {index === 0 && (
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Heading (deg)</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.inputField}
              value={editingAxis === "heading" ? draftHeading : (heading ?? 0).toFixed(1)}
              onFocus={() => startEditing("heading")}
              onChange={(e) => {
                if (isNumericDraft(e.target.value)) setDraftHeading(e.target.value);
              }}
              onBlur={(e) => commitEdit("heading", e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, "heading", e.currentTarget.value)}
            />
          </div>
        )}
        {index > 0 && (
          <>
            <div className={styles.selectGroup}>
              <label className={styles.inputLabel}>Heading</label>
              <select
                className={styles.selectField}
                value={headingMode}
                onChange={(e) => onInterpolationChange?.(e.target.value as HeadingInterpolation)}
              >
                <option value="constant">Constant</option>
                <option value="linear">Linear</option>
                <option value="tangential">Tangential</option>
              </select>
            </div>
            {headingMode === "constant" && (
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Value</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className={styles.inputField}
                  value={editingAxis === "constant" ? draftPathHeading : constantHeading.toFixed(1)}
                  onFocus={() => startEditing("constant")}
                  onChange={(e) => {
                    if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                  }}
                  onBlur={(e) => commitEdit("constant", e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "constant", e.currentTarget.value)}
                />
              </div>
            )}
            {headingMode === "linear" && (
              <>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Start</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.inputField}
                    value={editingAxis === "start" ? draftPathHeading : startHeading.toFixed(1)}
                    onFocus={() => startEditing("start")}
                    onChange={(e) => {
                      if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                    }}
                    onBlur={(e) => commitEdit("start", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "start", e.currentTarget.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>End</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.inputField}
                    value={editingAxis === "end" ? draftPathHeading : endHeading.toFixed(1)}
                    onFocus={() => startEditing("end")}
                    onChange={(e) => {
                      if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                    }}
                    onBlur={(e) => commitEdit("end", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "end", e.currentTarget.value)}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
      {index > 0 && (
        <div className={styles.controlPointsPanel}>
          <div className={styles.controlPointsHeader}>
            <button
              className={styles.controlPointsToggle}
              onClick={onToggleControlsExpanded}
              aria-expanded={controlsExpanded}
            >
              <svg
                className={`${styles.chevronIcon} ${controlsExpanded ? styles.chevronOpen : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Control Points ({controlPointCount})</span>
            </button>
            <button className={styles.addControlPointButton} onClick={onAddControlPoint}>
              <span aria-hidden="true">+</span>
              Add
            </button>
          </div>
          {controlsExpanded && controlPoints.length > 0 && (
            <div className={styles.controlPointsBody}>
              {controlPoints.map((controlPoint, controlIndex) => (
                <ControlPointCard
                  key={controlPoint.id}
                  index={controlIndex}
                  x={controlPoint.x}
                  y={controlPoint.y}
                  onChange={(axis, val) => onControlPointChange?.(controlIndex, axis, val)}
                  onEditStart={onControlPointEditStart}
                  onEditCommit={onControlPointEditCommit}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
