"use client";

import { useCallback, useRef, useState } from "react";
import { limitHistoryDepth } from "../plannerStorage";
import type { AutonSequenceItem, PlannerSnapshot, Point } from "../plannerTypes";

const clonePoints = (source: Point[]) =>
  source.map((point) => ({
    ...point,
    controlPoints: point.controlPoints?.map((controlPoint) => ({ ...controlPoint })),
    actionTriggers: point.actionTriggers?.map((trigger) => ({ ...trigger })),
  }));

const cloneSequenceItems = (source: AutonSequenceItem[]) => source.map((item) => ({ ...item }));

const cloneSnapshot = (snapshot: PlannerSnapshot): PlannerSnapshot => ({
  points: clonePoints(snapshot.points),
  sequenceItems: cloneSequenceItems(snapshot.sequenceItems),
});

const arePointSnapshotsEqual = (a: Point[], b: Point[]) => JSON.stringify(a) === JSON.stringify(b);

type UsePlannerStateOptions = {
  initialPoints: Point[];
  onRestore?: () => void;
};

export function usePlannerState({ initialPoints, onRestore }: UsePlannerStateOptions) {
  const [points, setPoints] = useState<Point[]>(initialPoints);
  const [sequenceItems, setSequenceItems] = useState<AutonSequenceItem[]>([]);
  const [undoStack, setUndoStack] = useState<PlannerSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<PlannerSnapshot[]>([]);
  const pointsRef = useRef<Point[]>(initialPoints);
  const sequenceItemsRef = useRef<AutonSequenceItem[]>([]);
  const undoStackRef = useRef<PlannerSnapshot[]>([]);
  const redoStackRef = useRef<PlannerSnapshot[]>([]);
  const editStartSnapshotRef = useRef<PlannerSnapshot | null>(null);
  const nameEditStartSnapshotRef = useRef<PlannerSnapshot | null>(null);

  const setPlannerPoints = useCallback((updater: Point[] | ((currentPoints: Point[]) => Point[])) => {
    setPoints((currentPoints) => {
      const nextPoints = typeof updater === "function" ? updater(currentPoints) : updater;
      pointsRef.current = nextPoints;
      return nextPoints;
    });
  }, []);

  const setPlannerSequenceItems = useCallback((
    updater: AutonSequenceItem[] | ((currentItems: AutonSequenceItem[]) => AutonSequenceItem[])
  ) => {
    setSequenceItems((currentItems) => {
      const nextItems = typeof updater === "function" ? updater(currentItems) : updater;
      sequenceItemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const setPlannerSnapshot = useCallback((snapshot: PlannerSnapshot) => {
    const nextPoints = clonePoints(snapshot.points);
    const nextSequenceItems = cloneSequenceItems(snapshot.sequenceItems);
    pointsRef.current = nextPoints;
    sequenceItemsRef.current = nextSequenceItems;
    setPoints(nextPoints);
    setSequenceItems(nextSequenceItems);
  }, []);

  const setPlannerHistory = useCallback((undoSnapshots: PlannerSnapshot[], redoSnapshots: PlannerSnapshot[]) => {
    const nextUndoStack = limitHistoryDepth(undoSnapshots.map(cloneSnapshot));
    const nextRedoStack = limitHistoryDepth(redoSnapshots.map(cloneSnapshot));
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = nextRedoStack;
    setUndoStack(nextUndoStack);
    setRedoStack(nextRedoStack);
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
  }, []);

  const createSnapshot = (): PlannerSnapshot => ({
    points: clonePoints(pointsRef.current),
    sequenceItems: cloneSequenceItems(sequenceItemsRef.current),
  });

  const areSnapshotsEqual = (a: PlannerSnapshot, b: PlannerSnapshot) =>
    arePointSnapshotsEqual(a.points, b.points) && JSON.stringify(a.sequenceItems) === JSON.stringify(b.sequenceItems);

  const clearHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
  };

  const pushUndoSnapshot = (snapshot: PlannerSnapshot | null) => {
    if (!snapshot || areSnapshotsEqual(snapshot, createSnapshot())) return;

    const nextUndoStack = limitHistoryDepth([...undoStackRef.current, snapshot]);
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = [];
    setUndoStack(nextUndoStack);
    setRedoStack([]);
  };

  const pushCurrentSnapshot = () => {
    const currentSnapshot = createSnapshot();
    const nextUndoStack = limitHistoryDepth([...undoStackRef.current, currentSnapshot]);
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = [];
    setUndoStack(nextUndoStack);
    setRedoStack([]);
  };

  const pushCurrentSnapshotIfChanged = (nextPoints: Point[], nextSequenceItems = sequenceItemsRef.current) => {
    if (areSnapshotsEqual(createSnapshot(), { points: nextPoints, sequenceItems: nextSequenceItems })) return;
    pushCurrentSnapshot();
  };

  const beginPositionEdit = () => {
    editStartSnapshotRef.current ??= createSnapshot();
  };

  const commitPositionEdit = () => {
    pushUndoSnapshot(editStartSnapshotRef.current);
    editStartSnapshotRef.current = null;
  };

  const beginNameEdit = () => {
    nameEditStartSnapshotRef.current ??= createSnapshot();
  };

  const commitNameEdit = () => {
    pushUndoSnapshot(nameEditStartSnapshotRef.current);
    nameEditStartSnapshotRef.current = null;
  };

  const restorePointSnapshot = useCallback((snapshot: PlannerSnapshot) => {
    const currentPresentationByPointId = new Map(
      pointsRef.current.map((point) => [
        point.id,
        {
          locked: point.locked,
          controlsExpanded: point.controlsExpanded,
          actionsExpanded: point.actionsExpanded,
        },
      ])
    );
    setPlannerSnapshot({
      ...snapshot,
      points: snapshot.points.map((point) => ({
        ...point,
        ...currentPresentationByPointId.get(point.id),
      })),
    });
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
    onRestore?.();
  }, [onRestore, setPlannerSnapshot]);

  const handleUndo = useCallback(() => {
    const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previousSnapshot) return;

    const nextRedoStack = limitHistoryDepth([...redoStackRef.current, createSnapshot()]);
    const nextUndoStack = undoStackRef.current.slice(0, -1);
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = nextRedoStack;
    setRedoStack(nextRedoStack);
    setUndoStack(nextUndoStack);
    restorePointSnapshot(previousSnapshot);
  }, [restorePointSnapshot]);

  const handleRedo = useCallback(() => {
    const nextSnapshot = redoStackRef.current[redoStackRef.current.length - 1];
    if (!nextSnapshot) return;

    const nextUndoStack = limitHistoryDepth([...undoStackRef.current, createSnapshot()]);
    const nextRedoStack = redoStackRef.current.slice(0, -1);
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = nextRedoStack;
    setUndoStack(nextUndoStack);
    setRedoStack(nextRedoStack);
    restorePointSnapshot(nextSnapshot);
  }, [restorePointSnapshot]);

  return {
    points,
    sequenceItems,
    undoStack,
    redoStack,
    pointsRef,
    sequenceItemsRef,
    undoStackRef,
    redoStackRef,
    setPlannerPoints,
    setPlannerSequenceItems,
    setPlannerSnapshot,
    setPlannerHistory,
    createSnapshot,
    clearHistory,
    pushUndoSnapshot,
    pushCurrentSnapshot,
    pushCurrentSnapshotIfChanged,
    beginPositionEdit,
    commitPositionEdit,
    beginNameEdit,
    commitNameEdit,
    handleUndo,
    handleRedo,
  };
}
