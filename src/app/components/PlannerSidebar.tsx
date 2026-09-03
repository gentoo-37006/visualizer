"use client";

import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  ReactNode,
} from "react";
import { DEFAULT_ROBOT_CONSTANTS, type RobotConstants, type SavedPose } from "../kotlinAutonFile";
import type {
  AutonActionMode,
  AutonAlliance,
  AutonSequenceItem,
  DragTarget,
  HeadingInterpolation,
  MotionParameters,
  PathGeometry,
  PathHeadingField,
  Point,
} from "../plannerTypes";
import { getPathSegments, targetPathIndex, toFieldCoords } from "../plannerUtils";
import styles from "../page.module.css";
import { ActionCard } from "./ActionCard";
import { PointCard } from "./PointCard";

export type SidebarPage = "auton" | "poses" | "constants";

const UploadPageIcon = () => (
  <svg
    className={styles.pageButtonActionIcon}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

type PlannerSidebarProps = {
  sidebarPage: SidebarPage;
  points: Point[];
  sequenceItems: AutonSequenceItem[];
  autonAlliance: AutonAlliance;
  savedPoses: SavedPose[];
  robotConstants: RobotConstants;
  motionParameterDrafts: Record<keyof MotionParameters, string>;
  hoverTarget: DragTarget | null;
  activeTarget: DragTarget | null;
  undoStackLength: number;
  redoStackLength: number;
  isShiftPressed: boolean;
  areActionsHidden: boolean;
  areControlPointsHidden: boolean;
  hasActions: boolean;
  hasControlPoints: boolean;
  draggingPathIndex: number | null;
  pathDropGapIndex: number | null;
  importInputRef: RefObject<HTMLInputElement | null>;
  posesInputRef: RefObject<HTMLInputElement | null>;
  constantsInputRef: RefObject<HTMLInputElement | null>;
  pointsListRef: RefObject<HTMLDivElement | null>;
  onUndo: () => void;
  onRedo: () => void;
  onAutonAllianceChange: (alliance: AutonAlliance) => void;
  onImportConstantsClick: () => void;
  onImportPosesClick: () => void;
  onSelectAutonClick: () => void;
  onExportKotlin: () => void;
  onImportKotlin: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportPoses: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportConstants: (event: ChangeEvent<HTMLInputElement>) => void;
  onSequenceCardPointerDown: (index: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onSequenceCardPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSequenceCardPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSequenceCardPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCoordChange: (index: number, axis: "x" | "y", value: string) => void;
  onStartPoseSelect: (name: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onHeadingChange: (value: string) => void;
  onRenamePath: (index: number, name: string) => void;
  onPathInterpolationChange: (index: number, mode: HeadingInterpolation) => void;
  onSegmentGeometryChange: (index: number, segmentIndex: number, pathGeometry: PathGeometry) => void;
  onPathHeadingChange: (index: number, field: PathHeadingField, value: string) => void;
  onPathTangentReversedChange: (index: number, tangentReversed: boolean) => void;
  onToggleActionsExpanded: (index: number) => void;
  onAddPathAction: (index: number) => void;
  onPathActionTriggerChange: (
    index: number,
    triggerId: string,
    field: "mode" | "actionName" | "t",
    value: string
  ) => void;
  onRemovePathActionTrigger: (index: number, triggerId: string) => void;
  onToggleLocked: (index: number) => void;
  onToggleHidden: (index: number, hideOthers: boolean) => void;
  onToggleControlsExpanded: (index: number) => void;
  onAddControlPoint: (index: number) => void;
  onControlCoordChange: (pathIndex: number, controlIndex: number, axis: "x" | "y", value: string) => void;
  onRemoveControlPoint: (pathIndex: number, controlIndex: number) => void;
  onReorderControlPoint: (pathIndex: number, fromIndex: number, toIndex: number) => void;
  onRemovePoint: (index: number) => void;
  onActionNameChange: (id: string, name: string) => void;
  onActionModeChange: (id: string, mode: AutonActionMode) => void;
  onActionTimeoutChange: (id: string, timeout: string) => void;
  onRemoveAction: (id: string) => void;
  pathDurations: Map<string, number>;
  outOfBoundsPointIds: Set<string>;
  onClearAuton: () => void;
  onMirrorAuton: () => void;
  onAddPoint: () => void;
  onAddAction: () => void;
  onToggleControlPointsHidden: () => void;
  onToggleActionsHidden: () => void;
  onUpdateMotionParameter: (key: keyof MotionParameters, value: string) => void;
  onFormatMotionParameter: (key: keyof MotionParameters) => void;
};

export function PlannerSidebar({
  sidebarPage,
  points,
  sequenceItems,
  autonAlliance,
  savedPoses,
  robotConstants,
  motionParameterDrafts,
  hoverTarget,
  activeTarget,
  undoStackLength,
  redoStackLength,
  isShiftPressed,
  areActionsHidden,
  areControlPointsHidden,
  hasActions,
  hasControlPoints,
  draggingPathIndex,
  pathDropGapIndex,
  importInputRef,
  posesInputRef,
  constantsInputRef,
  pointsListRef,
  onUndo,
  onRedo,
  onAutonAllianceChange,
  onImportConstantsClick,
  onImportPosesClick,
  onSelectAutonClick,
  onExportKotlin,
  onImportKotlin,
  onImportPoses,
  onImportConstants,
  onSequenceCardPointerDown,
  onSequenceCardPointerMove,
  onSequenceCardPointerUp,
  onSequenceCardPointerCancel,
  onCoordChange,
  onStartPoseSelect,
  onPositionEditStart,
  onPositionEditCommit,
  onNameEditStart,
  onNameEditCommit,
  onHeadingChange,
  onRenamePath,
  onPathInterpolationChange,
  onSegmentGeometryChange,
  onPathHeadingChange,
  onPathTangentReversedChange,
  onToggleActionsExpanded,
  onAddPathAction,
  onPathActionTriggerChange,
  onRemovePathActionTrigger,
  onToggleLocked,
  onToggleHidden,
  onToggleControlsExpanded,
  onAddControlPoint,
  onControlCoordChange,
  onRemoveControlPoint,
  onReorderControlPoint,
  onRemovePoint,
  onActionNameChange,
  onActionModeChange,
  onActionTimeoutChange,
  onRemoveAction,
  pathDurations,
  outOfBoundsPointIds,
  onClearAuton,
  onMirrorAuton,
  onAddPoint,
  onAddAction,
  onToggleControlPointsHidden,
  onToggleActionsHidden,
  onUpdateMotionParameter,
  onFormatMotionParameter,
}: PlannerSidebarProps) {
  const handleClearClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!event.shiftKey) return;
    onClearAuton();
  };

  const displayedSequenceItems = sequenceItems.length > 0
    ? sequenceItems
    : points.slice(1).map((point) => ({ id: `fallback-${point.id}`, kind: "path" as const, pointId: point.id }));
  const lastVisibleSequenceIndex = displayedSequenceItems.reduce<number | null>((lastIndex, item, sequenceIndex) => {
    if (item.kind === "action") return areActionsHidden ? lastIndex : sequenceIndex;
    return points.some((point) => point.id === item.pointId) ? sequenceIndex : lastIndex;
  }, null);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitleRow}>
          {sidebarPage === "auton" ? (
            <h2 className={styles.sidebarTitle}>Path Editor</h2>
          ) : sidebarPage === "poses" ? (
            <h2 className={styles.sidebarTitle}>Start Poses</h2>
          ) : (
            <h2 className={styles.sidebarTitle}>Constants</h2>
          )}
          <div className={styles.importExportActions}>
            <span className={styles.deleteAction}>
              <button
                className={`${styles.secondaryIconButton} ${styles.clearAutonButton} ${styles.deleteButton} ${isShiftPressed ? styles.deleteArmed : ""}`}
                onClick={handleClearClick}
                aria-label="Clear auton"
                aria-describedby={!isShiftPressed ? "clear-auton-tooltip" : undefined}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
              {!isShiftPressed && (
                <span
                  id="clear-auton-tooltip"
                  className={styles.deleteTooltip}
                  role="tooltip"
                >
                  Hold Shift to clear auton
                </span>
              )}
            </span>
            <button
              className={styles.secondaryIconButton}
              onClick={onMirrorAuton}
              aria-label="Mirror auton"
              title="Mirror auton"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="3" x2="12" y2="21"></line>
                <path d="M8 8 4 12l4 4"></path>
                <line x1="4" y1="12" x2="9" y2="12"></line>
                <path d="m16 8 4 4-4 4"></path>
                <line x1="15" y1="12" x2="20" y2="12"></line>
              </svg>
            </button>
            <button className={styles.secondaryIconButton} onClick={onUndo} aria-disabled={undoStackLength === 0} aria-label="Undo" title="Undo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6"></path>
                <path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>
              </svg>
            </button>
            <button className={styles.secondaryIconButton} onClick={onRedo} aria-disabled={redoStackLength === 0} aria-label="Redo" title="Redo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6"></path>
                <path d="M3 17a9 9 0 0 1 15-6.7L21 13"></path>
              </svg>
            </button>
            <button
              className={`${styles.secondaryIconButton} ${sidebarPage === "constants" ? styles.activeIconButton : ""}`}
              onClick={onImportConstantsClick}
              aria-label="Import Constants"
              title={sidebarPage === "constants" ? "Import Constants" : "Constants"}
            >
              <span className={styles.pageButtonIconSwap}>
                <svg className={styles.pageButtonDefaultIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" x2="4" y1="21" y2="14"></line>
                  <line x1="4" x2="4" y1="10" y2="3"></line>
                  <line x1="12" x2="12" y1="21" y2="12"></line>
                  <line x1="12" x2="12" y1="8" y2="3"></line>
                  <line x1="20" x2="20" y1="21" y2="16"></line>
                  <line x1="20" x2="20" y1="12" y2="3"></line>
                  <line x1="1" x2="7" y1="14" y2="14"></line>
                  <line x1="9" x2="15" y1="8" y2="8"></line>
                  <line x1="17" x2="23" y1="16" y2="16"></line>
                </svg>
                <UploadPageIcon />
              </span>
            </button>
            <button
              className={`${styles.secondaryIconButton} ${sidebarPage === "poses" ? styles.activeIconButton : ""}`}
              onClick={onImportPosesClick}
              aria-label="Import Poses"
              title={sidebarPage === "poses" ? "Import Start Poses" : "Start Poses"}
            >
              <span className={styles.pageButtonIconSwap}>
                <svg className={styles.pageButtonDefaultIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path>
                  <circle cx="12" cy="10" r="2.5"></circle>
                </svg>
                <UploadPageIcon />
              </span>
            </button>
            <button
              className={`${styles.secondaryIconButton} ${sidebarPage === "auton" ? styles.activeIconButton : ""}`}
              onClick={onSelectAutonClick}
              aria-label="Select Auton"
              title={sidebarPage === "auton" ? "Select Auton" : "Path Editor"}
            >
              <span className={styles.pageButtonIconSwap}>
                <svg className={styles.pageButtonDefaultIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="18" r="2"></circle>
                  <circle cx="18" cy="6" r="2"></circle>
                  <path d="M8 18c4 0 4-12 8-12"></path>
                  <path d="M12 10h.01"></path>
                </svg>
                <UploadPageIcon />
              </span>
            </button>
            <button
              className={styles.secondaryIconButton}
              onClick={onExportKotlin}
              disabled={sidebarPage !== "auton"}
              aria-label="Export Kotlin"
              title={sidebarPage === "auton" ? "Export Kotlin" : "Export is only available for the auton"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <polyline points="10 13 8 15 10 17"></polyline>
                <polyline points="14 13 16 15 14 17"></polyline>
              </svg>
            </button>
            <input ref={importInputRef} className={styles.hiddenFileInput} type="file" accept=".kt,text/x-kotlin,text/plain" onChange={onImportKotlin} />
            <input ref={posesInputRef} className={styles.hiddenFileInput} type="file" accept=".kt,text/x-kotlin,text/plain" onChange={onImportPoses} />
            <input ref={constantsInputRef} className={styles.hiddenFileInput} type="file" accept=".kt,text/x-kotlin,text/plain" onChange={onImportConstants} />
          </div>
        </div>
      </div>

      {sidebarPage === "auton" ? (
        <>
          <div
            ref={pointsListRef}
            className={styles.pointsList}
          >
            {points[0] && (
              <StartPoseCard
                point={points[0]}
                isOutOfBounds={outOfBoundsPointIds.has(points[0].id)}
                savedPoses={savedPoses}
                hoverTarget={hoverTarget}
                activeTarget={activeTarget}
                isShiftPressed={isShiftPressed}
                autonAlliance={autonAlliance}
                onAutonAllianceChange={onAutonAllianceChange}
                onCoordChange={onCoordChange}
                onStartPoseSelect={onStartPoseSelect}
                onPositionEditStart={onPositionEditStart}
                onPositionEditCommit={onPositionEditCommit}
                onNameEditStart={onNameEditStart}
                onNameEditCommit={onNameEditCommit}
                onHeadingChange={onHeadingChange}
                onToggleLocked={onToggleLocked}
              />
            )}
            {displayedSequenceItems.map((item, sequenceIndex) => {
              const isDropBefore = draggingPathIndex !== null && pathDropGapIndex === sequenceIndex;
              const isDropAfter =
                draggingPathIndex !== null &&
                sequenceIndex === lastVisibleSequenceIndex &&
                pathDropGapIndex === sequenceIndex + 1;
              const isBeingDragged = draggingPathIndex === sequenceIndex;

              if (item.kind === "action") {
                if (areActionsHidden) return null;

                return (
                  <SequenceDragWrapper
                    key={item.id}
                    sequenceIndex={sequenceIndex}
                    isDropBefore={isDropBefore}
                    isDropAfter={isDropAfter}
                    isBeingDragged={isBeingDragged}
                    onPointerDown={onSequenceCardPointerDown}
                    onPointerMove={onSequenceCardPointerMove}
                    onPointerUp={onSequenceCardPointerUp}
                    onPointerCancel={onSequenceCardPointerCancel}
                  >
                    <ActionCard
                      name={item.name}
                      mode={item.mode}
                      timeout={item.timeout}
                      onNameChange={(name) => onActionNameChange(item.id, name)}
                      onModeChange={(mode) => onActionModeChange(item.id, mode)}
                      onTimeoutChange={(timeout) => onActionTimeoutChange(item.id, timeout)}
                      onEditStart={onNameEditStart}
                      onEditCommit={onNameEditCommit}
                      canDelete={isShiftPressed}
                      onDelete={() => onRemoveAction(item.id)}
                    />
                  </SequenceDragWrapper>
                );
              }

              const pointIndex = points.findIndex((point) => point.id === item.pointId);
              const point = points[pointIndex];
              if (!point) return null;

              return (
                <SequenceDragWrapper
                  key={item.id}
                  sequenceIndex={sequenceIndex}
                  isDropBefore={isDropBefore}
                  isDropAfter={isDropAfter}
                  isBeingDragged={isBeingDragged}
                  onPointerDown={onSequenceCardPointerDown}
                  onPointerMove={onSequenceCardPointerMove}
                  onPointerUp={onSequenceCardPointerUp}
                  onPointerCancel={onSequenceCardPointerCancel}
                >
                  <PathPointCard
                    point={point}
                    index={pointIndex}
                    duration={pathDurations.get(point.id)}
                    isOutOfBounds={outOfBoundsPointIds.has(point.id)}
                    hoverTarget={hoverTarget}
                    activeTarget={activeTarget}
                    isShiftPressed={isShiftPressed}
                    onCoordChange={onCoordChange}
                    onPositionEditStart={onPositionEditStart}
                    onPositionEditCommit={onPositionEditCommit}
                    onRenamePath={onRenamePath}
                    onNameEditStart={onNameEditStart}
                    onNameEditCommit={onNameEditCommit}
                    onPathInterpolationChange={onPathInterpolationChange}
                    onSegmentGeometryChange={onSegmentGeometryChange}
                    onPathHeadingChange={onPathHeadingChange}
                    onPathTangentReversedChange={onPathTangentReversedChange}
                    onToggleActionsExpanded={onToggleActionsExpanded}
                    onAddPathAction={onAddPathAction}
                    onPathActionTriggerChange={onPathActionTriggerChange}
                    onRemovePathActionTrigger={onRemovePathActionTrigger}
                    onToggleLocked={onToggleLocked}
                    onToggleHidden={onToggleHidden}
                    onToggleControlsExpanded={onToggleControlsExpanded}
                    onAddControlPoint={onAddControlPoint}
                    onControlCoordChange={onControlCoordChange}
                    onRemoveControlPoint={onRemoveControlPoint}
                    onReorderControlPoint={onReorderControlPoint}
                    onRemovePoint={onRemovePoint}
                  />
                </SequenceDragWrapper>
              );
            })}
          </div>

          <div className={styles.sidebarFooter}>
            <button className={styles.addButton} onClick={onAddPoint}>
              <AddIcon />
              Add Path
            </button>
            <button className={`${styles.addButton} ${styles.addActionButton}`} onClick={onAddAction}>
              Add Action
            </button>
            <button
              className={`${styles.addButton} ${styles.visibilityToggleButton} ${areControlPointsHidden ? styles.visibilityHiddenButton : styles.controlPointsVisibleButton}`}
              onClick={() => {
                if (!hasControlPoints) return;
                onToggleControlPointsHidden();
              }}
              aria-disabled={!hasControlPoints}
              aria-pressed={areControlPointsHidden}
              aria-label={areControlPointsHidden ? "Show path controls" : "Hide path controls"}
              title={areControlPointsHidden ? "Show path controls" : "Hide path controls"}
            >
              <ControlPointsIcon hidden={areControlPointsHidden} />
            </button>
            <button
              className={`${styles.addButton} ${styles.visibilityToggleButton} ${areActionsHidden ? styles.visibilityHiddenButton : styles.actionsVisibleButton}`}
              onClick={() => {
                if (!hasActions) return;
                onToggleActionsHidden();
              }}
              aria-disabled={!hasActions}
              aria-pressed={areActionsHidden}
              aria-label={areActionsHidden ? "Show all actions" : "Hide all actions"}
              title={areActionsHidden ? "Show actions" : "Hide actions"}
            >
              <ActionIcon hidden={areActionsHidden} />
            </button>
          </div>
        </>
      ) : sidebarPage === "poses" ? (
        <StartPosesPanel savedPoses={savedPoses} />
      ) : (
        <ConstantsPanel
          robotConstants={robotConstants}
          motionParameterDrafts={motionParameterDrafts}
          onUpdateMotionParameter={onUpdateMotionParameter}
          onFormatMotionParameter={onFormatMotionParameter}
        />
      )}
    </aside>
  );
}

type SequenceDragWrapperProps = {
  sequenceIndex: number;
  isDropBefore: boolean;
  isDropAfter: boolean;
  isBeingDragged: boolean;
  children: ReactNode;
  onPointerDown: (index: number, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

function SequenceDragWrapper({
  sequenceIndex,
  isDropBefore,
  isDropAfter,
  isBeingDragged,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: SequenceDragWrapperProps) {
  return (
    <div
      className={`${styles.pointCardDragWrapper} ${styles.pointCardDraggable} ${isDropBefore ? styles.pointCardDropBefore : ""} ${isDropAfter ? styles.pointCardDropAfter : ""} ${isBeingDragged ? styles.pointCardDragging : ""}`}
      data-sequence-index={sequenceIndex}
      onPointerDown={(event) => onPointerDown(sequenceIndex, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </div>
  );
}

type StartPoseCardProps = {
  point: Point;
  isOutOfBounds: boolean;
  savedPoses: SavedPose[];
  hoverTarget: DragTarget | null;
  activeTarget: DragTarget | null;
  isShiftPressed: boolean;
  autonAlliance: AutonAlliance;
  onAutonAllianceChange: (alliance: AutonAlliance) => void;
  onCoordChange: (index: number, axis: "x" | "y", value: string) => void;
  onStartPoseSelect: (name: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onHeadingChange: (value: string) => void;
  onToggleLocked: (index: number) => void;
};

function StartPoseCard({
  point,
  isOutOfBounds,
  savedPoses,
  hoverTarget,
  activeTarget,
  isShiftPressed,
  autonAlliance,
  onAutonAllianceChange,
  onCoordChange,
  onStartPoseSelect,
  onPositionEditStart,
  onPositionEditCommit,
  onNameEditStart,
  onNameEditCommit,
  onHeadingChange,
  onToggleLocked,
}: StartPoseCardProps) {
  const coords = toFieldCoords(point.nx, point.ny);
  return (
    <PointCard
      index={0}
      isOutOfBounds={isOutOfBounds}
      name="Start Pose"
      poseName={point.poseName}
      color={point.color}
      locked={point.locked}
      hidden={Boolean(point.hidden)}
      x={coords.x}
      y={coords.y}
      heading={point.heading}
      headingMode={point.headingMode ?? "constant"}
      constantHeading={point.constantHeading ?? 0}
      startHeading={point.startHeading ?? 0}
      endHeading={point.endHeading ?? 0}
      linearStartT={point.linearStartT ?? 0}
      linearEndT={point.linearEndT ?? 1}
      controlPoints={[]}
      actionsExpanded={false}
      controlPointCount={0}
      controlsExpanded={false}
      isActive={targetPathIndex(hoverTarget) === 0 || targetPathIndex(activeTarget) === 0}
      cardSubheader={
        <div className={styles.startPoseAllianceRow}>
          <div className={styles.selectGroup}>
            <span className={styles.inputLabel}>Alliance</span>
            <button
              className={`${styles.selectField} ${styles.allianceToggleButton} ${autonAlliance === "BLUE" ? styles.blueAllianceButton : styles.redAllianceButton}`}
              onClick={() => onAutonAllianceChange(autonAlliance === "BLUE" ? "RED" : "BLUE")}
              aria-pressed={autonAlliance === "RED"}
            >
              {autonAlliance === "BLUE" ? "Blue" : "Red"}
            </button>
          </div>
        </div>
      }
      onChange={(axis, value) => onCoordChange(0, axis, value)}
      startPoseOptions={savedPoses}
      onStartPoseSelect={onStartPoseSelect}
      onPositionEditStart={onPositionEditStart}
      onPositionEditCommit={onPositionEditCommit}
      onNameEditStart={onNameEditStart}
      onNameEditCommit={onNameEditCommit}
      onHeadingChange={onHeadingChange}
      onToggleLocked={() => onToggleLocked(0)}
      onToggleHidden={() => undefined}
      onControlPointEditStart={onPositionEditStart}
      onControlPointEditCommit={onPositionEditCommit}
      canDelete={isShiftPressed}
      onDelete={() => undefined}
    />
  );
}

type PathPointCardProps = {
  point: Point;
  index: number;
  duration?: number;
  isOutOfBounds?: boolean;
  hoverTarget: DragTarget | null;
  activeTarget: DragTarget | null;
  isShiftPressed: boolean;
  onCoordChange: (index: number, axis: "x" | "y", value: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onRenamePath: (index: number, name: string) => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onPathInterpolationChange: (index: number, mode: HeadingInterpolation) => void;
  onSegmentGeometryChange: (index: number, segmentIndex: number, pathGeometry: PathGeometry) => void;
  onPathHeadingChange: (index: number, field: PathHeadingField, value: string) => void;
  onPathTangentReversedChange: (index: number, tangentReversed: boolean) => void;
  onToggleActionsExpanded: (index: number) => void;
  onAddPathAction: (index: number) => void;
  onPathActionTriggerChange: (
    index: number,
    triggerId: string,
    field: "mode" | "actionName" | "t",
    value: string
  ) => void;
  onRemovePathActionTrigger: (index: number, triggerId: string) => void;
  onToggleLocked: (index: number) => void;
  onToggleHidden: (index: number, hideOthers: boolean) => void;
  onToggleControlsExpanded: (index: number) => void;
  onAddControlPoint: (index: number) => void;
  onControlCoordChange: (pathIndex: number, controlIndex: number, axis: "x" | "y", value: string) => void;
  onRemoveControlPoint: (pathIndex: number, controlIndex: number) => void;
  onReorderControlPoint: (pathIndex: number, fromIndex: number, toIndex: number) => void;
  onRemovePoint: (index: number) => void;
};

function PathPointCard({
  point,
  index,
  duration,
  isOutOfBounds,
  hoverTarget,
  activeTarget,
  isShiftPressed,
  onCoordChange,
  onPositionEditStart,
  onPositionEditCommit,
  onRenamePath,
  onNameEditStart,
  onNameEditCommit,
  onPathInterpolationChange,
  onSegmentGeometryChange,
  onPathHeadingChange,
  onPathTangentReversedChange,
  onToggleActionsExpanded,
  onAddPathAction,
  onPathActionTriggerChange,
  onRemovePathActionTrigger,
  onToggleLocked,
  onToggleHidden,
  onToggleControlsExpanded,
  onAddControlPoint,
  onControlCoordChange,
  onRemoveControlPoint,
  onReorderControlPoint,
  onRemovePoint,
}: PathPointCardProps) {
  const coords = toFieldCoords(point.nx, point.ny);
  return (
    <PointCard
      index={index}
      duration={duration}
      isOutOfBounds={isOutOfBounds}
      name={point.name ?? `path${index}`}
      poseName={point.poseName}
      color={point.color}
      locked={point.locked}
      hidden={Boolean(point.hidden)}
      x={coords.x}
      y={coords.y}
      heading={point.heading}
      headingMode={point.headingMode ?? "constant"}
      constantHeading={point.constantHeading ?? 0}
      startHeading={point.startHeading ?? 0}
      endHeading={point.endHeading ?? 0}
      linearStartT={point.linearStartT ?? 0}
      linearEndT={point.linearEndT ?? 1}
      tangentReversed={point.tangentReversed ?? false}
      controlPoints={getPathSegments(point).map((segment) => ({
        id: segment.id,
        pathGeometry: segment.pathGeometry,
        ...toFieldCoords(segment.nx, segment.ny),
      }))}
      actionTriggers={point.actionTriggers ?? []}
      actionsExpanded={point.actionsExpanded ?? true}
      controlPointCount={getPathSegments(point).length}
      controlsExpanded={point.controlsExpanded ?? true}
      isActive={targetPathIndex(hoverTarget) === index || targetPathIndex(activeTarget) === index}
      onChange={(axis, value) => onCoordChange(index, axis, value)}
      onPositionEditStart={onPositionEditStart}
      onPositionEditCommit={onPositionEditCommit}
      onRename={(name) => onRenamePath(index, name)}
      onNameEditStart={onNameEditStart}
      onNameEditCommit={onNameEditCommit}
      onInterpolationChange={(mode) => onPathInterpolationChange(index, mode)}
      onPathHeadingChange={(field, value) => onPathHeadingChange(index, field, value)}
      onTangentReversedChange={(tangentReversed) => onPathTangentReversedChange(index, tangentReversed)}
      onToggleActionsExpanded={() => onToggleActionsExpanded(index)}
      onAddPathAction={() => onAddPathAction(index)}
      onPathActionTriggerChange={(triggerId, field, value) =>
        onPathActionTriggerChange(index, triggerId, field, value)
      }
      onRemovePathActionTrigger={(triggerId) => onRemovePathActionTrigger(index, triggerId)}
      onToggleLocked={() => onToggleLocked(index)}
      onToggleHidden={(hideOthers) => onToggleHidden(index, hideOthers)}
      onToggleControlsExpanded={() => onToggleControlsExpanded(index)}
      onAddControlPoint={() => onAddControlPoint(index)}
      onControlPointChange={(controlIndex, axis, value) => onControlCoordChange(index, controlIndex, axis, value)}
      onSegmentGeometryChange={(segmentIndex, pathGeometry) => onSegmentGeometryChange(index, segmentIndex, pathGeometry)}
      onRemoveControlPoint={(controlIndex) => onRemoveControlPoint(index, controlIndex)}
      onReorderControlPoint={(fromIndex, toIndex) => onReorderControlPoint(index, fromIndex, toIndex)}
      onControlPointEditStart={onPositionEditStart}
      onControlPointEditCommit={onPositionEditCommit}
      canDelete={isShiftPressed}
      onDelete={() => onRemovePoint(index)}
    />
  );
}

function StartPosesPanel({ savedPoses }: { savedPoses: SavedPose[] }) {
  return (
    <div className={styles.pointsList}>
      {savedPoses.length > 0 ? (
        savedPoses.map((pose) => (
          <div className={`${styles.poseCard} ${styles.startPoseListCard}`} key={pose.name}>
            <div className={styles.poseName}>{pose.name}</div>
            <div className={styles.poseCoordRow}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>X (in)</label>
                <input className={styles.inputField} value={pose.x.toFixed(1)} readOnly />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Y (in)</label>
                <input className={styles.inputField} value={pose.y.toFixed(1)} readOnly />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Heading (deg)</label>
                <input className={styles.inputField} value={(pose.heading ?? 0).toFixed(1)} readOnly />
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className={styles.emptyState}>No start poses saved.</div>
      )}
    </div>
  );
}

type ConstantsPanelProps = {
  robotConstants: RobotConstants;
  motionParameterDrafts: Record<keyof MotionParameters, string>;
  onUpdateMotionParameter: (key: keyof MotionParameters, value: string) => void;
  onFormatMotionParameter: (key: keyof MotionParameters) => void;
};

function ConstantsPanel({
  robotConstants,
  motionParameterDrafts,
  onUpdateMotionParameter,
  onFormatMotionParameter,
}: ConstantsPanelProps) {
  // Nothing else on this panel distinguishes a measured value from a placeholder,
  // so say it outright rather than letting stand-ins read as the team's own tuning.
  const isUsingDefaultConstants = (Object.keys(DEFAULT_ROBOT_CONSTANTS) as Array<keyof RobotConstants>).every(
    (key) => robotConstants[key] === DEFAULT_ROBOT_CONSTANTS[key]
  );

  return (
    <div className={styles.pointsList}>
      {isUsingDefaultConstants && (
        <div className={styles.emptyState}>
          Showing typical values. Import your Constants.kt to plan against the real robot.
        </div>
      )}
      <div className={`${styles.poseCard} ${styles.constantsCard}`}>
        <div className={styles.poseName}>Robot Dimensions</div>
        <div className={`${styles.poseCoordRow} ${styles.constantsCoordRow}`}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Width (in)</label>
            <input className={styles.inputField} value={robotConstants.width.toFixed(2)} readOnly />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Length (in)</label>
            <input className={styles.inputField} value={robotConstants.length.toFixed(2)} readOnly />
          </div>
        </div>
      </div>
      <div className={`${styles.poseCard} ${styles.constantsCard}`}>
        <div className={styles.poseName}>Braking Acceleration</div>
        <div className={`${styles.poseCoordRow} ${styles.constantsCoordRow}`}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Forward (in/s^2)</label>
            <input className={styles.inputField} value={robotConstants.forwardBrakeStrength.toFixed(5)} readOnly />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Lateral (in/s^2)</label>
            <input className={styles.inputField} value={robotConstants.lateralBrakeStrength.toFixed(5)} readOnly />
          </div>
        </div>
      </div>
      <div className={`${styles.poseCard} ${styles.constantsCard}`}>
        <div className={styles.poseName}>Max Velocity</div>
        <div className={`${styles.poseCoordRow} ${styles.constantsCoordRow}`}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Forward (in/s)</label>
            <input className={styles.inputField} value={robotConstants.maxForwardVelocity.toFixed(5)} readOnly />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Lateral (in/s)</label>
            <input className={styles.inputField} value={robotConstants.maxLateralVelocity.toFixed(5)} readOnly />
          </div>
        </div>
      </div>
      <EditableMotionParameterCard
        title="Acceleration"
        parameters={[
          ["maxForwardAcceleration", "Forward (in/s^2)"],
          ["maxLateralAcceleration", "Lateral (in/s^2)"],
        ]}
        motionParameterDrafts={motionParameterDrafts}
        onUpdateMotionParameter={onUpdateMotionParameter}
        onFormatMotionParameter={onFormatMotionParameter}
      />
      <EditableMotionParameterCard
        title="Angular Velocity"
        parameters={[["maxAngularVelocity", "(deg/s)"]]}
        motionParameterDrafts={motionParameterDrafts}
        onUpdateMotionParameter={onUpdateMotionParameter}
        onFormatMotionParameter={onFormatMotionParameter}
      />
    </div>
  );
}

type EditableMotionParameterCardProps = Omit<ConstantsPanelProps, "robotConstants"> & {
  title: string;
  parameters: Array<[keyof MotionParameters, string]>;
};

function EditableMotionParameterCard({
  title,
  parameters,
  motionParameterDrafts,
  onUpdateMotionParameter,
  onFormatMotionParameter,
}: EditableMotionParameterCardProps) {
  return (
    <div className={`${styles.poseCard} ${styles.constantsCard}`}>
      <div className={styles.poseName}>{title}</div>
      <div className={`${styles.poseCoordRow} ${styles.constantsCoordRow}`}>
        {parameters.map(([key, label]) => (
          <div className={styles.inputGroup} key={key}>
            <label className={styles.inputLabel}>{label}</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.inputField}
              value={motionParameterDrafts[key]}
              onChange={(event) => onUpdateMotionParameter(key, event.target.value)}
              onBlur={() => onFormatMotionParameter(key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function ActionIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m13 2-9 12h7l-1 8 10-12h-7V2z"></path>
      {hidden && <line x1="3" y1="3" x2="21" y2="21"></line>}
    </svg>
  );
}

function ControlPointsIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17c3-9 11-9 14 0"></path>
      <circle cx="5" cy="17" r="2"></circle>
      <circle cx="12" cy="8" r="2"></circle>
      <circle cx="19" cy="17" r="2"></circle>
      {hidden && <line x1="3" y1="3" x2="21" y2="21"></line>}
    </svg>
  );
}
