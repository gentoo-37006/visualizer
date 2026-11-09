"use client";

import { Select } from "./Select";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import styles from "../page.module.css";
import type { HeadingInterpolation, PathActionTrigger, PathActionTriggerMode, PathGeometry, PathHeadingField } from "../plannerTypes";
import { isKotlinIdentifierDraft, isNumericDraft } from "../plannerUtils";
import { SegmentCard } from "./ControlPointCard";
import { PosePicker, type PoseSelection } from "./PosePicker";
import type { SavedPose } from "../kotlinAutonFile";

type PointCardProps = {
  index: number;
  duration?: number;
  isOutOfBounds?: boolean;
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
  linearStartT: number;
  linearEndT: number;
  tangentReversed?: boolean;
  controlPoints: Array<{ id: string; x: number; y: number; poseName?: string; pathGeometry: PathGeometry }>;
  actionTriggers?: PathActionTrigger[];
  actionsExpanded: boolean;
  controlPointCount: number;
  controlsExpanded: boolean;
  isActive: boolean;
  cardSubheader?: ReactNode;
  onChange: (axis: "x" | "y", val: string) => void;
  startPoseOptions?: SavedPose[];
  onPoseChange?: (segmentIndex: number | null, pose: PoseSelection) => void;
  onStartPoseSelect?: (name: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onRename?: (name: string) => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onHeadingChange?: (val: string) => void;
  onInterpolationChange?: (mode: HeadingInterpolation) => void;
  onPathHeadingChange?: (field: PathHeadingField, val: string) => void;
  onMatchPreviousHeading?: () => void;
  onTangentReversedChange?: (tangentReversed: boolean) => void;
  onPathActionTriggerChange?: (
    triggerId: string,
    field: "mode" | "actionName" | "t",
    value: string
  ) => void;
  onToggleActionsExpanded?: () => void;
  onAddPathAction?: () => void;
  onRemovePathActionTrigger?: (triggerId: string) => void;
  onToggleLocked: () => void;
  onToggleHidden: (hideOthers: boolean) => void;
  onToggleControlsExpanded?: () => void;
  onAddControlPoint?: () => void;
  onControlPointChange?: (controlIndex: number, axis: "x" | "y", val: string) => void;
  onSegmentGeometryChange?: (controlIndex: number, pathGeometry: PathGeometry) => void;
  onRemoveControlPoint?: (controlIndex: number) => void;
  onReorderControlPoint?: (fromIndex: number, toIndex: number) => void;
  onControlPointEditStart: () => void;
  onControlPointEditCommit: () => void;
  canDelete: boolean;
  onDelete: () => void;
};

export function PointCard({
  index,
  duration,
  isOutOfBounds = false,
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
  linearStartT,
  linearEndT,
  tangentReversed = false,
  controlPoints,
  actionTriggers = [],
  actionsExpanded,
  controlPointCount,
  controlsExpanded,
  isActive,
  cardSubheader,
  startPoseOptions = [],
  onPoseChange,
  onRename,
  onNameEditStart,
  onNameEditCommit,
  onInterpolationChange,
  onPathHeadingChange,
  onMatchPreviousHeading,
  onTangentReversedChange,
  onPathActionTriggerChange,
  onToggleActionsExpanded,
  onAddPathAction,
  onRemovePathActionTrigger,
  onToggleLocked,
  onToggleHidden,
  onToggleControlsExpanded,
  onAddControlPoint,
  onControlPointChange,
  onSegmentGeometryChange,
  onRemoveControlPoint,
  onReorderControlPoint,
  onControlPointEditStart,
  onControlPointEditCommit,
  canDelete,
  onDelete,
}: PointCardProps) {
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | "heading" | PathHeadingField | null>(null);
  const [draftPathHeading, setDraftPathHeading] = useState("");
  const [editingActionTrigger, setEditingActionTrigger] = useState<string | null>(null);
  const [draftActionT, setDraftActionT] = useState("");
  const [draggingControlIndex, setDraggingControlIndex] = useState<number | null>(null);
  const [controlDropGapIndex, setControlDropGapIndex] = useState<number | null>(null);
  const controlPointsBodyRef = useRef<HTMLDivElement>(null);
  const controlPointerDragRef = useRef<{
    pointerId: number;
    index: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameBeforeEdit, setNameBeforeEdit] = useState("");

  const startEditing = (axis: "x" | "y" | "heading" | PathHeadingField) => {
    setEditingAxis(axis);
      const value =
        axis === "constant"
          ? constantHeading
          : axis === "start"
            ? startHeading
            : axis === "end"
              ? endHeading
              : axis === "startT"
                ? linearStartT
                : linearEndT;
      setDraftPathHeading(value.toFixed(axis === "startT" || axis === "endT" ? 2 : 1));
  };

  const commitEdit = (axis: "x" | "y" | "heading" | PathHeadingField, val: string) => {
    if (axis === "constant" || axis === "start" || axis === "end" || axis === "startT" || axis === "endT") onPathHeadingChange?.(axis, val);
    setEditingAxis(null);
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

  const sortedActionTriggers = [...actionTriggers].sort((a, b) => a.t - b.t);

  const handleControlCardPointerDown = (controlIndex: number, event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest("input, select, button, textarea")) return;
    event.preventDefault();
    controlPointerDragRef.current = {
      pointerId: event.pointerId,
      index: controlIndex,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const stopParentCardDrag = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (
      !target.closest("input, select, button, textarea, a, [role='button'], [contenteditable='true']") &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  };

  const controlGapAtPointer = (clientY: number) => {
    const cards = controlPointsBodyRef.current?.querySelectorAll<HTMLElement>("[data-control-index]");
    if (!cards?.length) return null;

    for (const card of cards) {
      const index = Number.parseInt(card.dataset.controlIndex ?? "", 10);
      if (!Number.isFinite(index)) continue;
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }

    const lastCard = cards[cards.length - 1];
    const lastIndex = Number.parseInt(lastCard.dataset.controlIndex ?? "", 10);
    return Number.isFinite(lastIndex) ? lastIndex + 1 : null;
  };

  const controlIndexForDropGap = (fromIndex: number, gapIndex: number) =>
    gapIndex > fromIndex ? gapIndex - 1 : gapIndex;

  const handleControlPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const drag = controlPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      drag.active = true;
      window.getSelection()?.removeAllRanges();
      setDraggingControlIndex(drag.index);
      setControlDropGapIndex(null);
    }
    event.preventDefault();
    const gapIndex = controlGapAtPointer(event.clientY);
    setControlDropGapIndex(gapIndex);
  };

  const clearControlDragState = () => {
    setDraggingControlIndex(null);
    setControlDropGapIndex(null);
  };

  const finishControlPointerDrag = (event: PointerEvent<HTMLDivElement>, shouldCommit: boolean) => {
    event.stopPropagation();
    const drag = controlPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    controlPointerDragRef.current = null;
    const gapIndex = shouldCommit && drag.active ? controlGapAtPointer(event.clientY) : null;
    const targetIndex = gapIndex === null ? null : controlIndexForDropGap(drag.index, gapIndex);
    if (targetIndex !== null && targetIndex !== drag.index) {
      onReorderControlPoint?.(drag.index, targetIndex);
    }
    clearControlDragState();
  };

  const handleControlPointerUp = (event: PointerEvent<HTMLDivElement>) => finishControlPointerDrag(event, true);
  const handleControlPointerCancel = (event: PointerEvent<HTMLDivElement>) => finishControlPointerDrag(event, false);

  const handleNameFocus = () => {
    onNameEditStart();
    setIsEditingName(true);
    setDraftName(name);
    setNameBeforeEdit(name);
  };

  const handleNameBlur = () => {
    const trimmedName = draftName.trim();
    const nextName = trimmedName || `path${index}`;
    if (nextName !== nameBeforeEdit) {
      onRename?.(nextName);
    }
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
            maxLength={16}
            value={isEditingName ? draftName : name}
            onFocus={handleNameFocus}
            onChange={(e) => {
              if (!isKotlinIdentifierDraft(e.target.value)) return;
              setDraftName(e.target.value);
              onRename?.(e.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={handleNameBlur}
            aria-label={`Rename path ${index}`}
          />
        )}
        <div className={styles.pointCardHeaderEnd}>
        {isOutOfBounds && (
          <span
            className={styles.pathWarning}
            role="img"
            aria-label="The robot leaves the field on this path"
            title="The robot leaves the field on this path"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </span>
        )}
        {duration !== undefined && (
          <span className={styles.pathDuration} title="Estimated time this path takes, including the turn onto its start heading">
            {duration.toFixed(1)}s
          </span>
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
      </div>
      {cardSubheader}
      <div className={styles.coordRow}>
        {index === 0 && <div className={styles.poseInputGroup}><span className={styles.inputLabel}>Pose (in, deg)</span><PosePicker x={x} y={y} heading={heading ?? 0} poseName={poseName} savedPoses={startPoseOptions} label="Start pose" onChange={pose => onPoseChange?.(null, pose)} /></div>}
        {index > 0 && (
          <>
            <div className={styles.selectGroup}>
              <label className={styles.inputLabel}>Heading</label>
              <Select
                className={styles.selectField}
                value={headingMode}
                onChange={(value) => onInterpolationChange?.(value as HeadingInterpolation)}
              >
                <option value="constant">Constant</option>
                <option value="linear">Linear</option>
                <option value="tangential">Tangential</option>
              </Select>
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
                <div className={`${styles.inputGroup} ${styles.linearStartHeadingGroup}`}>
                  <label className={styles.inputLabel}>Start</label>
                  <div className={styles.headingInputWithAction}>
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
                    <span className={styles.matchPreviousHeadingAction}>
                      <button
                        type="button"
                        className={styles.matchPreviousHeadingButton}
                        onClick={onMatchPreviousHeading}
                        aria-label="Match previous"
                        aria-describedby={`match-previous-heading-tooltip-${index}`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 12a9 9 0 1 0 3-7.7L3 7"></path>
                          <path d="M3 3v4h4"></path>
                        </svg>
                      </button>
                      <span
                        id={`match-previous-heading-tooltip-${index}`}
                        className={styles.matchPreviousHeadingTooltip}
                        role="tooltip"
                      >
                        Match previous
                      </span>
                    </span>
                  </div>
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
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Start %</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.inputField}
                    value={editingAxis === "startT" ? draftPathHeading : linearStartT.toFixed(2)}
                    onFocus={() => startEditing("startT")}
                    onChange={(e) => {
                      if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                    }}
                    onBlur={(e) => commitEdit("startT", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "startT", e.currentTarget.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>End %</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.inputField}
                    value={editingAxis === "endT" ? draftPathHeading : linearEndT.toFixed(2)}
                    onFocus={() => startEditing("endT")}
                    onChange={(e) => {
                      if (isNumericDraft(e.target.value)) setDraftPathHeading(e.target.value);
                    }}
                    onBlur={(e) => commitEdit("endT", e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, "endT", e.currentTarget.value)}
                  />
                </div>
              </>
            )}
            {headingMode === "tangential" && (
              <div className={styles.selectGroup}>
                <label className={styles.inputLabel}>Direction</label>
                <Select
                  className={styles.selectField}
                  value={tangentReversed ? "reversed" : "forward"}
                  onChange={(value) => onTangentReversedChange?.(value === "reversed")}
                  aria-label="Tangential direction"
                >
                  <option value="forward">Forward</option>
                  <option value="reversed">Reversed</option>
                </Select>
              </div>
            )}
          </>
        )}
      </div>
      {index > 0 && (
        <div className={styles.pathActionsPanel}>
          <div className={styles.pathActionsHeader}>
            <button
              className={styles.pathActionsToggle}
              onClick={onToggleActionsExpanded}
              aria-expanded={actionsExpanded}
            >
              <svg
                className={`${styles.chevronIcon} ${actionsExpanded ? styles.chevronOpen : ""}`}
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
              <span>Path Actions ({sortedActionTriggers.length})</span>
            </button>
            <button className={styles.addPathActionButton} onClick={onAddPathAction}>
              <span aria-hidden="true">+</span>
              Add
            </button>
          </div>
          {actionsExpanded && sortedActionTriggers.length > 0 && (
            <div className={styles.pathActionsBody}>
              {sortedActionTriggers.map((trigger, triggerIndex) => (
                <div
                  className={styles.pathActionCard}
                  key={trigger.id}
                  data-card-drag-block="true"
                  onPointerDown={stopParentCardDrag}
                >
                  <div className={styles.pathActionTitleRow}>
                    <input
                      className={styles.pathActionNameInput}
                      maxLength={24}
                      value={trigger.actionName}
                      placeholder={`Action ${triggerIndex + 1}`}
                      onChange={(event) =>
                        onPathActionTriggerChange?.(trigger.id, "actionName", event.target.value.toUpperCase())
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      aria-label={`Path action ${triggerIndex + 1} name`}
                    />
                    <span className={styles.deleteAction}>
                      <button
                        className={`${styles.iconButton} ${styles.deleteButton} ${canDelete ? styles.deleteArmed : ""}`}
                        onClick={(event) => {
                          if (!event.shiftKey) return;
                          onRemovePathActionTrigger?.(trigger.id);
                        }}
                        aria-label={`Remove path action ${triggerIndex + 1}`}
                        aria-describedby={!canDelete ? `path-action-delete-tooltip-${index}-${trigger.id}` : undefined}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                      {!canDelete && (
                        <span
                          id={`path-action-delete-tooltip-${index}-${trigger.id}`}
                          className={styles.deleteTooltip}
                          role="tooltip"
                        >
                          Hold Shift to delete
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.pathActionInputs}>
                    <div className={styles.actionTriggerTGroup}>
                      <label className={styles.inputLabel} htmlFor={`path-action-distance-${index}-${trigger.id}`}>Start %</label>
                      <input
                        id={`path-action-distance-${index}-${trigger.id}`}
                        type="text"
                        inputMode="decimal"
                        className={styles.inputField}
                        value={editingActionTrigger === trigger.id ? draftActionT : trigger.t.toFixed(2)}
                        placeholder="0.00"
                        onFocus={() => {
                          setEditingActionTrigger(trigger.id);
                          setDraftActionT(trigger.t.toFixed(2));
                        }}
                        onChange={(event) => {
                          if (!isNumericDraft(event.target.value)) return;
                          setDraftActionT(event.target.value);
                          onPathActionTriggerChange?.(trigger.id, "t", event.target.value);
                        }}
                        onBlur={() => setEditingActionTrigger(null)}
                      />
                    </div>
                    <div className={styles.actionTriggerModeGroup}>
                      <label className={styles.inputLabel}>Mode</label>
                      <Select
                        className={styles.selectField}
                        value={trigger.mode}
                        onChange={(value) =>
                          onPathActionTriggerChange?.(trigger.id, "mode", value as PathActionTriggerMode)
                        }
                      >
                        <option value="submit">Submit</option>
                        <option value="remove">Remove</option>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
              <span>Segments ({controlPointCount})</span>
            </button>
            <button className={styles.addControlPointButton} onClick={onAddControlPoint}>
              <span aria-hidden="true">+</span>
              Add Segment
            </button>
          </div>
          {controlsExpanded && controlPoints.length > 0 && (
            <div ref={controlPointsBodyRef} className={styles.controlPointsBody}>
              {controlPoints.map((controlPoint, controlIndex) => (
                <div
                  key={controlPoint.id}
                  className={`${styles.pointCardDragWrapper} ${styles.pointCardDraggable} ${draggingControlIndex !== null && controlDropGapIndex === controlIndex ? styles.pointCardDropBefore : ""} ${draggingControlIndex !== null && controlIndex === controlPoints.length - 1 && controlDropGapIndex === controlIndex + 1 ? styles.pointCardDropAfter : ""} ${draggingControlIndex === controlIndex ? styles.pointCardDragging : ""}`}
                  data-card-drag-block="true"
                  data-control-index={controlIndex}
                  onPointerDown={(event) => {
                    stopParentCardDrag(event);
                    handleControlCardPointerDown(controlIndex, event);
                  }}
                  onPointerMove={handleControlPointerMove}
                  onPointerUp={handleControlPointerUp}
                  onPointerCancel={handleControlPointerCancel}
                >
                  <SegmentCard
                    index={controlIndex}
                    pathGeometry={controlPoint.pathGeometry}
                    x={controlPoint.x}
                    y={controlPoint.y}
                    poseName={controlPoint.poseName}
                    savedPoses={startPoseOptions}
                    onPoseChange={pose => onPoseChange?.(controlIndex, pose)}
                    onPathGeometryChange={(pathGeometry) => onSegmentGeometryChange?.(controlIndex, pathGeometry)}
                    onChange={(axis, val) => onControlPointChange?.(controlIndex, axis, val)}
                    onEditStart={onControlPointEditStart}
                    onEditCommit={onControlPointEditCommit}
                    canDelete={canDelete}
                    canRemove={controlPoints.length > 1}
                    onDelete={() => onRemoveControlPoint?.(controlIndex)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
