"use client";

import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  ReactNode,
} from "react";
import type { RobotConstants, SavedPose } from "../kotlinAutonFile";
import type {
  AutonActionMode,
  AutonAlliance,
  AutonSequenceItem,
  DragTarget,
  HeadingInterpolation,
  MotionParameters,
  PathHeadingField,
  Point,
} from "../plannerTypes";
import { targetPathIndex, toFieldCoords } from "../plannerUtils";
import styles from "../page.module.css";
import { ActionCard } from "./ActionCard";
import { PointCard } from "./PointCard";

export type SidebarPage = "auton" | "poses" | "constants";

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
  hasActions: boolean;
  draggingPathIndex: number | null;
  dragOverPathIndex: number | null;
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
  onPointsListDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onPointsListDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  onStopCardDragAutoScroll: () => void;
  onSequenceCardPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRestoreSequenceCardDragging: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPathCardDragStart: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onPathCardDragOver: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onPathCardDrop: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onClearPathCardDragState: () => void;
  onCoordChange: (index: number, axis: "x" | "y", value: string) => void;
  onStartPoseSelect: (name: string) => void;
  onPositionEditStart: () => void;
  onPositionEditCommit: () => void;
  onNameEditStart: () => void;
  onNameEditCommit: () => void;
  onHeadingChange: (value: string) => void;
  onRenamePath: (index: number, name: string) => void;
  onPathInterpolationChange: (index: number, mode: HeadingInterpolation) => void;
  onPathHeadingChange: (index: number, field: PathHeadingField, value: string) => void;
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
  onAddPoint: () => void;
  onAddAction: () => void;
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
  hasActions,
  draggingPathIndex,
  dragOverPathIndex,
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
  onPointsListDragOver,
  onPointsListDragLeave,
  onStopCardDragAutoScroll,
  onSequenceCardPointerDownCapture,
  onRestoreSequenceCardDragging,
  onPathCardDragStart,
  onPathCardDragOver,
  onPathCardDrop,
  onClearPathCardDragState,
  onCoordChange,
  onStartPoseSelect,
  onPositionEditStart,
  onPositionEditCommit,
  onNameEditStart,
  onNameEditCommit,
  onHeadingChange,
  onRenamePath,
  onPathInterpolationChange,
  onPathHeadingChange,
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
  onAddPoint,
  onAddAction,
  onToggleActionsHidden,
  onUpdateMotionParameter,
  onFormatMotionParameter,
}: PlannerSidebarProps) {
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20"></path>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path>
                <path d="M19 12h3"></path>
                <path d="M2 12h3"></path>
              </svg>
            </button>
            <button
              className={`${styles.secondaryIconButton} ${sidebarPage === "poses" ? styles.activeIconButton : ""}`}
              onClick={onImportPosesClick}
              aria-label="Import Poses"
              title={sidebarPage === "poses" ? "Import Start Poses" : "Start Poses"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="18" r="2"></circle>
                <circle cx="18" cy="6" r="2"></circle>
                <path d="M8 18c4 0 4-12 8-12"></path>
                <path d="M12 10h.01"></path>
              </svg>
            </button>
            <button
              className={`${styles.secondaryIconButton} ${sidebarPage === "auton" ? styles.activeIconButton : ""}`}
              onClick={onSelectAutonClick}
              aria-label="Select Auton"
              title={sidebarPage === "auton" ? "Select Auton" : "Path Editor"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"></path>
                <path d="M14 2v6h6"></path>
                <path d="m9 15 2 2 4-4"></path>
              </svg>
            </button>
            <button
              className={styles.secondaryIconButton}
              onClick={onExportKotlin}
              disabled={sidebarPage === "constants"}
              aria-label={sidebarPage === "poses" ? "Export Poses" : "Export Kotlin"}
              title={sidebarPage === "constants" ? "Export unavailable for robot constants" : sidebarPage === "poses" ? "Export Poses" : "Export Kotlin"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
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
          <div className={styles.autonSettingsRow}>
            <button
              className={`${styles.allianceToggleButton} ${autonAlliance === "BLUE" ? styles.blueAllianceButton : styles.redAllianceButton}`}
              onClick={() => onAutonAllianceChange(autonAlliance === "BLUE" ? "RED" : "BLUE")}
              aria-pressed={autonAlliance === "RED"}
            >
              {autonAlliance === "BLUE" ? "Blue Alliance" : "Red Alliance"}
            </button>
          </div>
          <div
            ref={pointsListRef}
            className={styles.pointsList}
            onDragOver={onPointsListDragOver}
            onDragLeave={onPointsListDragLeave}
            onDrop={onStopCardDragAutoScroll}
          >
            {points[0] && (
              <StartPoseCard
                point={points[0]}
                savedPoses={savedPoses}
                hoverTarget={hoverTarget}
                activeTarget={activeTarget}
                isShiftPressed={isShiftPressed}
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
            {(sequenceItems.length > 0
              ? sequenceItems
              : points.slice(1).map((point) => ({ id: `fallback-${point.id}`, kind: "path" as const, pointId: point.id }))
            ).map((item, sequenceIndex) => {
              const isDragOverTarget = draggingPathIndex !== null && draggingPathIndex !== sequenceIndex && dragOverPathIndex === sequenceIndex;
              const isBeingDragged = draggingPathIndex === sequenceIndex;

              if (item.kind === "action") {
                if (areActionsHidden) return null;

                return (
                  <SequenceDragWrapper
                    key={item.id}
                    sequenceIndex={sequenceIndex}
                    isDragOverTarget={isDragOverTarget}
                    isBeingDragged={isBeingDragged}
                    onPointerDownCapture={onSequenceCardPointerDownCapture}
                    onPointerUpCapture={onRestoreSequenceCardDragging}
                    onPointerCancel={onRestoreSequenceCardDragging}
                    onDragStart={onPathCardDragStart}
                    onDragOver={onPathCardDragOver}
                    onDrop={onPathCardDrop}
                    onDragEnd={onClearPathCardDragState}
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
                  isDragOverTarget={isDragOverTarget}
                  isBeingDragged={isBeingDragged}
                  onPointerDownCapture={onSequenceCardPointerDownCapture}
                  onPointerUpCapture={onRestoreSequenceCardDragging}
                  onPointerCancel={onRestoreSequenceCardDragging}
                  onDragStart={onPathCardDragStart}
                  onDragOver={onPathCardDragOver}
                  onDrop={onPathCardDrop}
                  onDragEnd={onClearPathCardDragState}
                >
                  <PathPointCard
                    point={point}
                    index={pointIndex}
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
                    onPathHeadingChange={onPathHeadingChange}
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
              <AddIcon />
              Add Action
            </button>
            <button
              className={`${styles.addButton} ${styles.toggleActionsButton} ${areActionsHidden ? styles.actionsHiddenButton : ""}`}
              onClick={() => {
                if (!hasActions) return;
                onToggleActionsHidden();
              }}
              aria-disabled={!hasActions}
              aria-pressed={areActionsHidden}
              aria-label={areActionsHidden ? "Show all actions" : "Hide all actions"}
              title={areActionsHidden ? "Show actions" : "Hide actions"}
            >
              {areActionsHidden ? <ShowIcon /> : <HideIcon />}
              {areActionsHidden ? "Show Actions" : "Hide Actions"}
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
  isDragOverTarget: boolean;
  isBeingDragged: boolean;
  children: ReactNode;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragStart: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (index: number, event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
};

function SequenceDragWrapper({
  sequenceIndex,
  isDragOverTarget,
  isBeingDragged,
  children,
  onPointerDownCapture,
  onPointerUpCapture,
  onPointerCancel,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SequenceDragWrapperProps) {
  return (
    <div
      className={`${styles.pointCardDragWrapper} ${styles.pointCardDraggable} ${isDragOverTarget ? styles.pointCardDropTarget : ""} ${isBeingDragged ? styles.pointCardDragging : ""}`}
      draggable
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancel={onPointerCancel}
      onDragStart={(event) => onDragStart(sequenceIndex, event)}
      onDragOver={(event) => onDragOver(sequenceIndex, event)}
      onDrop={(event) => onDrop(sequenceIndex, event)}
      onDragEnd={onDragEnd}
    >
      {children}
    </div>
  );
}

type StartPoseCardProps = {
  point: Point;
  savedPoses: SavedPose[];
  hoverTarget: DragTarget | null;
  activeTarget: DragTarget | null;
  isShiftPressed: boolean;
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
  savedPoses,
  hoverTarget,
  activeTarget,
  isShiftPressed,
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
  onPathHeadingChange: (index: number, field: PathHeadingField, value: string) => void;
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
  onPathHeadingChange,
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
      controlPoints={(point.controlPoints ?? []).map((controlPoint) => ({
        id: controlPoint.id,
        ...toFieldCoords(controlPoint.nx, controlPoint.ny),
      }))}
      actionTriggers={point.actionTriggers ?? []}
      actionsExpanded={point.actionsExpanded ?? true}
      controlPointCount={(point.controlPoints ?? []).length}
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
          <div className={styles.poseCard} key={pose.name}>
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
  return (
    <div className={styles.pointsList}>
      <div className={styles.poseCard}>
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
      <div className={styles.poseCard}>
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
      <div className={styles.poseCard}>
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
    <div className={styles.poseCard}>
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

function ShowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
}

function HideIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94"></path>
      <path d="M9.9 4.24A10.6 10.6 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"></path>
      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"></path>
      <line x1="2" y1="2" x2="22" y2="22"></line>
    </svg>
  );
}
