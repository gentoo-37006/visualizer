"use client";

import { useCallback, useRef, useState } from "react";
import type { AutonSequenceItem, PlannerSnapshot, Point } from "../plannerTypes";

const clonePoints = (source: Point[]) =>
  source.map((point) => ({
    ...point,
    controlPoints: point.controlPoints?.map((controlPoint) => ({ ...controlPoint })),
    actionTriggers: point.actionTriggers?.map((trigger) => ({ ...trigger })),
  }));

const cloneSequenceItems = (source: AutonSequenceItem[]) => source.map((item) => ({ ...item }));

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

  const setPlannerSnapshot = (snapshot: PlannerSnapshot) => {
    const nextPoints = clonePoints(snapshot.points);
    const nextSequenceItems = cloneSequenceItems(snapshot.sequenceItems);
    pointsRef.current = nextPoints;
    sequenceItemsRef.current = nextSequenceItems;
    setPoints(nextPoints);
    setSequenceItems(nextSequenceItems);
  };

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

    const nextUndoStack = [...undoStackRef.current, snapshot];
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = [];
    setUndoStack(nextUndoStack);
    setRedoStack([]);
  };

  const pushCurrentSnapshot = () => {
    const currentSnapshot = createSnapshot();
    const nextUndoStack = [...undoStackRef.current, currentSnapshot];
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
    setPlannerSnapshot(snapshot);
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
    onRestore?.();
  }, [onRestore]);

  const handleUndo = useCallback(() => {
    const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previousSnapshot) return;

    const nextRedoStack = [...redoStackRef.current, createSnapshot()];
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

    const nextUndoStack = [...undoStackRef.current, createSnapshot()];
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
    setPlannerPoints,
    setPlannerSequenceItems,
    setPlannerSnapshot,
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
