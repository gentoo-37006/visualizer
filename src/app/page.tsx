"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { PointCard } from "./components/PointCard";
import {
  serializePathPlannerKotlin,
  serializeSavedPosesKotlin,
  parsePathPlannerKotlin,
  parseRobotConstantsKotlin,
  parseSavedPosesKotlin,
  sanitizeKotlinClassName,
  DEFAULT_ROBOT_CONSTANTS,
  type RobotConstants,
  type SavedPose,
} from "./kotlinAutonFile";
import {
  FIELD_BORDER_WIDTH,
  INITIAL_POINT_COLOR,
  INITIAL_POINT_ID,
  POINT_DIAMETER,
  POINT_RADIUS,
} from "./plannerConstants";
import type { DragTarget, FieldSize, HeadingInterpolation, PathHeadingField, Point } from "./plannerTypes";
import {
  controlPointHitRadius,
  createDefaultHeadingValues,
  createSplinePath,
  generateId,
  isSameTarget,
  mainPointHitRadius,
  normalizeHeading,
  randomColor,
  isKotlinIdentifierDraft,
  targetPathIndex,
  toFieldCoords,
  toNormalizedCoords,
  toSvgPixelCoords,
} from "./plannerUtils";
import styles from "./page.module.css";

const SAVED_POSES_STORAGE_KEY = "auton-path-planner:saved-poses";
const ROBOT_CONSTANTS_STORAGE_KEY = "auton-path-planner:robot-constants";

const isSavedPoseArray = (value: unknown): value is SavedPose[] =>
  Array.isArray(value) &&
  value.every(
    (pose) =>
      typeof pose?.name === "string" &&
      typeof pose?.x === "number" &&
      typeof pose?.y === "number"
  );

const loadSavedPoses = () => {
  if (typeof window === "undefined") return [];

  const storedSavedPoses = window.localStorage.getItem(SAVED_POSES_STORAGE_KEY);
  if (!storedSavedPoses) return [];

  try {
    const parsedSavedPoses: unknown = JSON.parse(storedSavedPoses);
    return isSavedPoseArray(parsedSavedPoses) ? parsedSavedPoses : [];
  } catch {
    window.localStorage.removeItem(SAVED_POSES_STORAGE_KEY);
    return [];
  }
};

const isRobotConstants = (value: unknown): value is RobotConstants =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RobotConstants).width === "number" &&
  typeof (value as RobotConstants).length === "number" &&
  typeof (value as RobotConstants).forwardBrakeStrength === "number" &&
  typeof (value as RobotConstants).lateralBrakeStrength === "number" &&
  typeof (value as RobotConstants).maxForwardVelocity === "number" &&
  typeof (value as RobotConstants).maxLateralVelocity === "number";

const loadRobotConstants = () => {
  if (typeof window === "undefined") return DEFAULT_ROBOT_CONSTANTS;

  const storedRobotConstants = window.localStorage.getItem(ROBOT_CONSTANTS_STORAGE_KEY);
  if (!storedRobotConstants) return DEFAULT_ROBOT_CONSTANTS;

  try {
    const parsedRobotConstants: unknown = JSON.parse(storedRobotConstants);
    return isRobotConstants(parsedRobotConstants) ? parsedRobotConstants : DEFAULT_ROBOT_CONSTANTS;
  } catch {
    window.localStorage.removeItem(ROBOT_CONSTANTS_STORAGE_KEY);
    return DEFAULT_ROBOT_CONSTANTS;
  }
};

const clonePoints = (source: Point[]) =>
  source.map((point) => ({
    ...point,
    controlPoints: point.controlPoints?.map((controlPoint) => ({ ...controlPoint })),
  }));

const arePointSnapshotsEqual = (a: Point[], b: Point[]) => JSON.stringify(a) === JSON.stringify(b);
type SidebarPage = "auton" | "poses" | "constants";
const CARD_DRAG_SCROLL_ZONE_HEIGHT = 88;
const CARD_DRAG_SCROLL_MAX_SPEED = 22;

export default function PathPlannerPage() {
  const [autonClassName, setAutonClassName] = useState("AutonPath");
  const [points, setPoints] = useState<Point[]>([
    { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: INITIAL_POINT_COLOR, locked: true, heading: 0 },
  ]);
  const [undoStack, setUndoStack] = useState<Point[][]>([]);
  const [redoStack, setRedoStack] = useState<Point[][]>([]);
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const [activeTarget, setActiveTarget] = useState<DragTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [fieldSize, setFieldSize] = useState<FieldSize>({ width: 0, height: 0 });
  const [kotlinExport, setKotlinExport] = useState<{ fileName: string; subtitle: string; contents: string } | null>(null);
  const [didCopyExport, setDidCopyExport] = useState(false);
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>(loadSavedPoses);
  const [robotConstants, setRobotConstants] = useState<RobotConstants>(loadRobotConstants);
  const [sidebarPage, setSidebarPage] = useState<SidebarPage>("auton");
  const [draggingPathIndex, setDraggingPathIndex] = useState<number | null>(null);
  const [dragOverPathIndex, setDragOverPathIndex] = useState<number | null>(null);

  const fieldRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const posesInputRef = useRef<HTMLInputElement>(null);
  const constantsInputRef = useRef<HTMLInputElement>(null);
  const exportTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const pointsListRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<Point[]>(points);
  const undoStackRef = useRef<Point[][]>([]);
  const redoStackRef = useRef<Point[][]>([]);
  const dragStartSnapshotRef = useRef<Point[] | null>(null);
  const editStartSnapshotRef = useRef<Point[] | null>(null);
  const nameEditStartSnapshotRef = useRef<Point[] | null>(null);
  const cardDragScrollSpeedRef = useRef(0);
  const cardDragScrollFrameRef = useRef<number | null>(null);
  const hasMeasuredField = fieldSize.width > 0 && fieldSize.height > 0;
  const isPointVisible = (index: number) => {
    const previousSegmentVisible = index > 0 && !points[index].hidden;
    const nextSegmentVisible = index < points.length - 1 && !points[index + 1].hidden;
    return previousSegmentVisible || nextSegmentVisible || points.length === 1;
  };

  const setPlannerPoints = (updater: Point[] | ((currentPoints: Point[]) => Point[])) => {
    setPoints((currentPoints) => {
      const nextPoints = typeof updater === "function" ? updater(currentPoints) : updater;
      pointsRef.current = nextPoints;
      return nextPoints;
    });
  };

  const clearHistory = () => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
    dragStartSnapshotRef.current = null;
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
  };

  const pushUndoSnapshot = (snapshot: Point[] | null) => {
    if (!snapshot || arePointSnapshotsEqual(snapshot, pointsRef.current)) return;

    const nextUndoStack = [...undoStackRef.current, clonePoints(snapshot)];
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = [];
    setUndoStack(nextUndoStack);
    setRedoStack([]);
  };

  const pushCurrentSnapshot = () => {
    const currentSnapshot = clonePoints(pointsRef.current);
    const nextUndoStack = [...undoStackRef.current, currentSnapshot];
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = [];
    setUndoStack(nextUndoStack);
    setRedoStack([]);
  };

  const pushCurrentSnapshotIfChanged = (nextPoints: Point[]) => {
    if (arePointSnapshotsEqual(pointsRef.current, nextPoints)) return;
    pushCurrentSnapshot();
  };

  const beginPositionEdit = () => {
    editStartSnapshotRef.current ??= clonePoints(pointsRef.current);
  };

  const commitPositionEdit = () => {
    pushUndoSnapshot(editStartSnapshotRef.current);
    editStartSnapshotRef.current = null;
  };

  const beginNameEdit = () => {
    nameEditStartSnapshotRef.current ??= clonePoints(pointsRef.current);
  };

  const commitNameEdit = () => {
    pushUndoSnapshot(nameEditStartSnapshotRef.current);
    nameEditStartSnapshotRef.current = null;
  };

  const restorePointSnapshot = useCallback((snapshot: Point[]) => {
    const restoredPoints = clonePoints(snapshot);
    pointsRef.current = restoredPoints;
    setPoints(restoredPoints);
    setHoverTarget(null);
    setActiveTarget(null);
    setIsDragging(false);
    dragStartSnapshotRef.current = null;
    editStartSnapshotRef.current = null;
    nameEditStartSnapshotRef.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previousSnapshot) return;

    const nextRedoStack = [...redoStackRef.current, clonePoints(pointsRef.current)];
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

    const nextUndoStack = [...undoStackRef.current, clonePoints(pointsRef.current)];
    const nextRedoStack = redoStackRef.current.slice(0, -1);
    undoStackRef.current = nextUndoStack;
    redoStackRef.current = nextRedoStack;
    setUndoStack(nextUndoStack);
    setRedoStack(nextRedoStack);
    restorePointSnapshot(nextSnapshot);
  }, [restorePointSnapshot]);

  useEffect(() => {
    const handleHistoryKeyDown = (event: globalThis.KeyboardEvent) => {
      if (kotlinExport) return;

      const isHistoryModifier = event.ctrlKey || event.metaKey;
      if (!isHistoryModifier || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      } else if (key === "z") {
        event.preventDefault();
        handleUndo();
      } else if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleHistoryKeyDown);
    return () => window.removeEventListener("keydown", handleHistoryKeyDown);
  }, [handleUndo, handleRedo, kotlinExport]);

  useEffect(() => {
    if (!kotlinExport) return;

    const frame = requestAnimationFrame(() => {
      exportTextAreaRef.current?.focus();
      exportTextAreaRef.current?.select();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setKotlinExport(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [kotlinExport]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFieldSize((current) => {
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    });

    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPlannerPoints((currentPoints) =>
        currentPoints.map((point) =>
          point.id === INITIAL_POINT_ID ? { ...point, color: randomColor() } : point
        )
      );
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift") setIsShiftPressed(true);
    };
    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Shift") setIsShiftPressed(false);
    };
    const handleBlur = () => setIsShiftPressed(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const handleAddPoint = () => {
    pushCurrentSnapshot();
    const seed = points.length > 0 ? points[points.length - 1] : { nx: 0.5, ny: 0.5 };
    setPlannerPoints([
      ...points,
      {
        id: generateId(),
        name: `path${points.length}`,
        nx: seed.nx,
        ny: seed.ny,
        color: randomColor(),
        locked: false,
        hidden: false,
        ...createDefaultHeadingValues(),
      },
    ]);
  };

  const handleRemovePoint = (index: number) => {
    pushCurrentSnapshot();
    setPlannerPoints(points.filter((_, i) => i !== index));
    if (targetPathIndex(activeTarget) === index) setActiveTarget(null);
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const reorderPoints = (source: Point[], fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex <= 0 ||
      toIndex <= 0 ||
      fromIndex >= source.length ||
      toIndex >= source.length
    ) {
      return source;
    }

    const reorderedPoints = [...source];
    const [movedPoint] = reorderedPoints.splice(fromIndex, 1);
    reorderedPoints.splice(toIndex, 0, movedPoint);
    return reorderedPoints;
  };

  const stopCardDragAutoScroll = () => {
    cardDragScrollSpeedRef.current = 0;
    if (cardDragScrollFrameRef.current !== null) {
      cancelAnimationFrame(cardDragScrollFrameRef.current);
      cardDragScrollFrameRef.current = null;
    }
  };

  const startCardDragAutoScroll = () => {
    if (cardDragScrollFrameRef.current !== null) return;

    const run = () => {
      const list = pointsListRef.current;
      const speed = cardDragScrollSpeedRef.current;
      if (!list || speed === 0) {
        cardDragScrollFrameRef.current = null;
        return;
      }

      const previousScrollTop = list.scrollTop;
      list.scrollTop += speed;
      if (list.scrollTop === previousScrollTop) {
        cardDragScrollSpeedRef.current = 0;
        cardDragScrollFrameRef.current = null;
        return;
      }

      cardDragScrollFrameRef.current = requestAnimationFrame(run);
    };

    cardDragScrollFrameRef.current = requestAnimationFrame(run);
  };

  const updateCardDragAutoScrollFromPointer = (clientY: number) => {
    const list = pointsListRef.current;
    if (!list || draggingPathIndex === null) {
      stopCardDragAutoScroll();
      return;
    }

    const rect = list.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) {
      stopCardDragAutoScroll();
      return;
    }

    const zoneHeight = Math.min(CARD_DRAG_SCROLL_ZONE_HEIGHT, rect.height / 2);
    const topBoundary = rect.top + zoneHeight;
    const bottomBoundary = rect.bottom - zoneHeight;

    let direction: "up" | "down" | null = null;
    let strength = 0;

    if (clientY < topBoundary) {
      direction = "up";
      strength = (topBoundary - clientY) / zoneHeight;
    } else if (clientY > bottomBoundary) {
      direction = "down";
      strength = (clientY - bottomBoundary) / zoneHeight;
    }

    if (!direction) {
      stopCardDragAutoScroll();
      return;
    }

    const boundedStrength = Math.max(0, Math.min(1, strength));
    const easedStrength = boundedStrength * boundedStrength;
    const speed = CARD_DRAG_SCROLL_MAX_SPEED * easedStrength;
    cardDragScrollSpeedRef.current = direction === "up" ? -speed : speed;
    startCardDragAutoScroll();
  };

  const clearPathCardDragState = () => {
    setDraggingPathIndex(null);
    setDragOverPathIndex(null);
    stopCardDragAutoScroll();
  };

  const handlePathCardDragStart = (index: number, event: ReactDragEvent<HTMLDivElement>) => {
    if (index <= 0) {
      event.preventDefault();
      return;
    }

    setDraggingPathIndex(index);
    setDragOverPathIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", points[index].id);
  };

  const handlePathCardDragOver = (index: number, event: ReactDragEvent<HTMLDivElement>) => {
    if (index <= 0 || draggingPathIndex === null || draggingPathIndex === index) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverPathIndex !== index) setDragOverPathIndex(index);
    updateCardDragAutoScrollFromPointer(event.clientY);
  };

  const handlePathCardDrop = (index: number, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggingPathIndex === null || index <= 0 || draggingPathIndex === index) {
      clearPathCardDragState();
      return;
    }

    const nextPoints = reorderPoints(pointsRef.current, draggingPathIndex, index);
    if (nextPoints === pointsRef.current) {
      clearPathCardDragState();
      return;
    }

    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
    setHoverTarget(null);
    setActiveTarget(null);
    setIsDragging(false);
    clearPathCardDragState();
  };

  const handlePointsListDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (draggingPathIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updateCardDragAutoScrollFromPointer(event.clientY);
  };

  const handlePointsListDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (draggingPathIndex === null) return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    stopCardDragAutoScroll();
  };

  useEffect(() => {
    return () => {
      if (cardDragScrollFrameRef.current !== null) {
        cancelAnimationFrame(cardDragScrollFrameRef.current);
      }
    };
  }, []);

  const handleToggleLocked = (index: number) => {
    if (points[index].hidden) return;

    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, locked: !point.locked } : point
      )
    );
    if (targetPathIndex(activeTarget) === index) {
      setActiveTarget(null);
      setIsDragging(false);
    }
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const handleToggleHidden = (index: number, hideOthers: boolean) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i === 0) return point;
        if (hideOthers) {
          const allOtherPathsHidden = currentPoints.every((otherPoint, otherIndex) =>
            otherIndex === 0 || otherIndex === index || otherPoint.hidden
          );
          return { ...point, hidden: allOtherPathsHidden ? false : i !== index };
        }
        return i === index ? { ...point, hidden: !point.hidden } : point;
      })
    );
    if (targetPathIndex(activeTarget) === index) {
      setActiveTarget(null);
      setIsDragging(false);
    }
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const handleRenamePath = (index: number, name: string) => {
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) => (i === index ? { ...point, name } : point))
    );
  };

  const updatePoint = (index: number, nx: number, ny: number) => {
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, nx, ny, poseName: index === 0 ? undefined : point.poseName } : point
      )
    );
  };

  const updateControlPoint = (pathIndex: number, controlIndex: number, nx: number, ny: number) => {
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i !== pathIndex) return point;
        return {
          ...point,
          controlPoints: (point.controlPoints ?? []).map((controlPoint, j) =>
            j === controlIndex ? { ...controlPoint, nx, ny } : controlPoint
          ),
        };
      })
    );
  };

  const updateTargetPosition = (target: DragTarget, nx: number, ny: number) => {
    if (target.kind === "point") {
      updatePoint(target.index, nx, ny);
    } else {
      updateControlPoint(target.pathIndex, target.controlIndex, nx, ny);
    }
  };

  const handleToggleControlsExpanded = (index: number) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, controlsExpanded: !(point.controlsExpanded ?? true) } : point
      )
    );
  };

  const handleAddControlPoint = (index: number) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i !== index) return point;
        const controlPoints = point.controlPoints ?? [];
        const previousPoint = currentPoints[index - 1];
        const seed = controlPoints[controlPoints.length - 1] ?? {
          nx: previousPoint ? (previousPoint.nx + point.nx) / 2 : point.nx,
          ny: previousPoint ? (previousPoint.ny + point.ny) / 2 : point.ny,
        };

        return {
          ...point,
          controlPoints: [...controlPoints, { id: generateId(), nx: seed.nx, ny: seed.ny }],
          controlsExpanded: true,
        };
      })
    );
  };

  const handleControlCoordChange = (
    pathIndex: number,
    controlIndex: number,
    axis: "x" | "y",
    value: string
  ) => {
    const controlPoint = points[pathIndex].controlPoints?.[controlIndex];
    if (!controlPoint) return;

    const currentField = toFieldCoords(controlPoint.nx, controlPoint.ny);
    const num = parseFloat(value);
    if (isNaN(num)) return;

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    updateControlPoint(pathIndex, controlIndex, nx, ny);
  };

  const handleCoordChange = (index: number, axis: "x" | "y", value: string) => {
    const p = points[index];
    const currentField = toFieldCoords(p.nx, p.ny);
    const num = parseFloat(value);
    if (isNaN(num)) return;

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    if (index === 0) {
      setPlannerPoints((currentPoints) =>
        currentPoints.map((point, pointIndex) =>
          pointIndex === index ? { ...point, nx, ny, poseName: undefined } : point
        )
      );
      return;
    }

    updatePoint(index, nx, ny);
  };

  const handleStartPoseSelect = (poseName: string) => {
    if (!poseName) {
      pushCurrentSnapshot();
      setPlannerPoints((currentPoints) =>
        currentPoints.map((point, index) =>
          index === 0 ? { ...point, poseName: undefined } : point
        )
      );
      return;
    }

    const savedPose = savedPoses.find((pose) => pose.name === poseName);
    if (!savedPose) return;

    const { nx, ny } = toNormalizedCoords(savedPose.x, savedPose.y);
    const nextPoints = pointsRef.current.map((point, index) =>
      index === 0 ? { ...point, nx, ny, poseName: savedPose.name } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleHeadingChange = (value: string) => {
    const heading = parseFloat(value);
    if (isNaN(heading)) return;

    const normalizedHeading = normalizeHeading(heading);
    const nextPoints = pointsRef.current.map((point) =>
      point.id === INITIAL_POINT_ID ? { ...point, heading: normalizedHeading } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point) =>
        point.id === INITIAL_POINT_ID
          ? { ...point, heading: normalizedHeading }
          : point
      )
    );
  };

  const handlePathInterpolationChange = (index: number, mode: HeadingInterpolation) => {
    const nextPoints = pointsRef.current.map((point, i) =>
      i === index ? { ...createDefaultHeadingValues(), ...point, headingMode: mode } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index
          ? { ...createDefaultHeadingValues(), ...point, headingMode: mode }
          : point
      )
    );
  };

  const handlePathHeadingChange = (index: number, field: PathHeadingField, value: string) => {
    const heading = parseFloat(value);
    if (isNaN(heading)) return;

    const normalizedHeading = normalizeHeading(heading);
    const key =
      field === "constant"
        ? "constantHeading"
        : field === "start"
          ? "startHeading"
          : "endHeading";

    const nextPoints = pointsRef.current.map((point, i) =>
      i === index ? { ...point, [key]: normalizedHeading } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, [key]: normalizedHeading } : point
      )
    );
  };

  const handleExportKotlin = () => {
    if (sidebarPage === "poses") {
      const contents = serializeSavedPosesKotlin(savedPoses, robotConstants);
      setDidCopyExport(false);
      setKotlinExport({
        fileName: "Poses.kt",
        subtitle: "Start pose declarations",
        contents,
      });
      return;
    }

    const className = sanitizeKotlinClassName(autonClassName);
    const contents = serializePathPlannerKotlin(points, className, savedPoses);
    setAutonClassName(className);
    setDidCopyExport(false);
    setKotlinExport({
      fileName: `${className}.kt`,
      subtitle: "Generated Kotlin class",
      contents,
    });
  };

  const handleCopyKotlinExport = async () => {
    if (!kotlinExport) return;

    exportTextAreaRef.current?.select();
    try {
      await navigator.clipboard.writeText(kotlinExport.contents);
      setDidCopyExport(true);
    } catch {
      setDidCopyExport(false);
    }
  };

  const handleSelectAutonClick = () => {
    if (sidebarPage !== "auton") {
      setSidebarPage("auton");
      return;
    }

    importInputRef.current?.click();
  };

  const handleImportPosesClick = () => {
    if (sidebarPage !== "poses") {
      setSidebarPage("poses");
      return;
    }

    posesInputRef.current?.click();
  };

  const handleImportConstantsClick = () => {
    if (sidebarPage !== "constants") {
      setSidebarPage("constants");
      return;
    }

    constantsInputRef.current?.click();
  };

  const importKotlinContents = (contents: string) => {
    const importedAuton = parsePathPlannerKotlin(contents, savedPoses);
    if (!importedAuton || importedAuton.points.length === 0) {
      window.alert("This Kotlin file does not contain an Auton Path Planner export.");
      return;
    }

    setAutonClassName(importedAuton.className);
    clearHistory();
    setPlannerPoints(importedAuton.points);
    setHoverTarget(null);
    setActiveTarget(null);
    setIsDragging(false);
    setSidebarPage("auton");
  };

  const importKotlinFile = async (file: File) => {
    try {
      const contents = await file.text();
      importKotlinContents(contents);
    } catch {
      window.alert("Unable to import this Kotlin file.");
    }
  };

  const handleImportKotlin = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await importKotlinFile(file);
  };

  const handleImportPoses = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const contents = await file.text();
      const importedSavedPoses = parseSavedPosesKotlin(contents, robotConstants);
      if (importedSavedPoses.length === 0) {
        window.alert("This poses file does not contain any START poses.");
        return;
      }

      setSavedPoses(importedSavedPoses);
      window.localStorage.setItem(SAVED_POSES_STORAGE_KEY, JSON.stringify(importedSavedPoses));
      setSidebarPage("poses");
    } catch {
      window.alert("Unable to import this poses file.");
    }
  };

  const handleImportConstants = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const contents = await file.text();
      const importedRobotConstants = parseRobotConstantsKotlin(contents);
      if (!importedRobotConstants) {
        window.alert("This constants file does not contain the required robot constants.");
        return;
      }

      setRobotConstants(importedRobotConstants);
      window.localStorage.setItem(ROBOT_CONSTANTS_STORAGE_KEY, JSON.stringify(importedRobotConstants));
      setSidebarPage("constants");
    } catch {
      window.alert("Unable to import this constants file.");
    }
  };

  const getPointerNormalized = (e: ReactPointerEvent<SVGSVGElement> | globalThis.PointerEvent) => {
    if (!svgRef.current) return { nx: 0, ny: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const fieldWidth = rect.width - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    const fieldHeight = rect.height - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    let nx = (e.clientX - rect.left - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldWidth;
    let ny = (e.clientY - rect.top - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldHeight;

    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));

    return { nx, ny };
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pathIndex = targetPathIndex(hoverTarget);
    if (
      hoverTarget !== null &&
      pathIndex !== null &&
      !points[pathIndex].locked &&
      isPointVisible(pathIndex)
    ) {
      dragStartSnapshotRef.current = clonePoints(pointsRef.current);
      setIsDragging(true);
      setActiveTarget(hoverTarget);
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isDragging && activeTarget !== null) {
      const { nx, ny } = getPointerNormalized(e);
      updateTargetPosition(activeTarget, nx, ny);
      return;
    }

    if (!svgRef.current) return;
    const { nx, ny } = getPointerNormalized(e);
    const minFieldSize = Math.min(
      fieldSize.width - FIELD_BORDER_WIDTH * 2,
      fieldSize.height - FIELD_BORDER_WIDTH * 2
    );
    if (minFieldSize <= 0) return;

    let hit: DragTarget | null = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].locked) continue;
      const controlPoints = points[i].controlPoints ?? [];
      if (!points[i].hidden) {
        for (let j = controlPoints.length - 1; j >= 0; j--) {
          const dx = controlPoints[j].nx - nx;
          const dy = controlPoints[j].ny - ny;
          if (Math.sqrt(dx * dx + dy * dy) <= controlPointHitRadius(minFieldSize)) {
            hit = { kind: "control", pathIndex: i, controlIndex: j };
            break;
          }
        }
      }
      if (hit) break;
      if (!isPointVisible(i)) continue;

      const dx = points[i].nx - nx;
      const dy = points[i].ny - ny;
      if (Math.sqrt(dx * dx + dy * dy) <= mainPointHitRadius(minFieldSize)) {
        hit = { kind: "point", index: i };
        break;
      }
    }
    setHoverTarget(hit);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      pushUndoSnapshot(dragStartSnapshotRef.current);
      dragStartSnapshotRef.current = null;
    }
    setIsDragging(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.fieldWrapper}>
        <div className={styles.fieldContainer} ref={fieldRef}>
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
            onPointerLeave={() => { if (!isDragging) setHoverTarget(null); }}
            style={{ cursor: isDragging ? "grabbing" : (hoverTarget !== null ? "pointer" : "default") }}
            viewBox={`0 0 ${fieldSize.width + POINT_DIAMETER} ${fieldSize.height + POINT_DIAMETER}`}
          >
            {hasMeasuredField && points.map((p, i) => {
              if (i === points.length - 1) return null;
              const nextP = points[i + 1];
              if (nextP.hidden) return null;
              const start = toSvgPixelCoords(p.nx, p.ny, fieldSize);
              const end = toSvgPixelCoords(nextP.nx, nextP.ny, fieldSize);
              const controlPoints = (nextP.controlPoints ?? []).map((controlPoint) =>
                toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize)
              );

              if (controlPoints.length > 0) {
                return (
                  <path
                    key={`line-${p.id}`}
                    d={createSplinePath(start, controlPoints, end)}
                    fill="none"
                    stroke={nextP.color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }

              return (
                <line
                  key={`line-${p.id}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={nextP.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              );
            })}

            {hasMeasuredField && points.map((p, i) => {
              if (!isPointVisible(i)) return null;
              const { x, y } = toSvgPixelCoords(p.nx, p.ny, fieldSize);
              const isHovered = isSameTarget(hoverTarget, { kind: "point", index: i }) && !p.locked;

              return (
                <g key={`point-${p.id}`}>
                  {isHovered && (
                    <circle
                      cx={x}
                      cy={y}
                      r={POINT_DIAMETER / 2}
                      fill="rgba(0,0,0,0.45)"
                      filter="blur(4px)"
                      transform="translate(0 2)"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={POINT_DIAMETER / 2}
                    fill={p.color}
                    stroke={isHovered ? "white" : "transparent"}
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {hasMeasuredField && points.map((p, i) =>
              p.hidden ? null : (p.controlPoints ?? []).map((controlPoint, j) => {
                const { x, y } = toSvgPixelCoords(controlPoint.nx, controlPoint.ny, fieldSize);
                const isHovered =
                  isSameTarget(hoverTarget, { kind: "control", pathIndex: i, controlIndex: j }) && !p.locked;

                return (
                  <g key={`control-${controlPoint.id}`}>
                    {isHovered && (
                      <circle
                        cx={x}
                        cy={y}
                        r={POINT_DIAMETER / 2}
                        fill="rgba(0,0,0,0.45)"
                        filter="blur(4px)"
                        transform="translate(0 2)"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={POINT_DIAMETER / 2}
                      fill={p.color}
                      stroke={isHovered ? "white" : "transparent"}
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#111827"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="central"
                      pointerEvents="none"
                    >
                      {j + 1}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            {sidebarPage === "auton" ? (
              <input
                className={styles.autonClassNameInput}
                value={autonClassName}
                maxLength={32}
                onChange={(event) => {
                  if (!isKotlinIdentifierDraft(event.target.value)) return;
                  setAutonClassName(event.target.value);
                }}
                onBlur={() => setAutonClassName((className) => sanitizeKotlinClassName(className))}
                aria-label="Auton class name"
              />
            ) : sidebarPage === "poses" ? (
              <h2 className={styles.sidebarTitle}>Saved Poses</h2>
            ) : (
              <h2 className={styles.sidebarTitle}>Robot Constants</h2>
            )}
            <div className={styles.importExportActions}>
              <button
                className={styles.secondaryIconButton}
                onClick={handleUndo}
                aria-disabled={undoStack.length === 0}
                aria-label="Undo"
                title="Undo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6"></path>
                  <path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>
                </svg>
              </button>
              <button
                className={styles.secondaryIconButton}
                onClick={handleRedo}
                aria-disabled={redoStack.length === 0}
                aria-label="Redo"
                title="Redo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7v6h-6"></path>
                  <path d="M3 17a9 9 0 0 1 15-6.7L21 13"></path>
                </svg>
              </button>
              <button
                className={`${styles.secondaryIconButton} ${sidebarPage === "constants" ? styles.activeIconButton : ""}`}
                onClick={handleImportConstantsClick}
                aria-label="Import Robot Constants"
                title={
                  sidebarPage === "constants"
                    ? "Import Robot Constants"
                    : `Robot Constants (${robotConstants.width.toFixed(1)} x ${robotConstants.length.toFixed(1)})`
                }
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
                onClick={handleImportPosesClick}
                aria-label="Import Poses"
                title={sidebarPage === "poses" ? "Import Poses" : "Saved Poses"}
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
                onClick={handleSelectAutonClick}
                aria-label="Select Auton"
                title={sidebarPage === "auton" ? "Select Auton" : "Auton Paths"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z"></path>
                  <path d="M14 2v6h6"></path>
                  <path d="m9 15 2 2 4-4"></path>
                </svg>
              </button>
              <button
                className={styles.secondaryIconButton}
                onClick={handleExportKotlin}
                disabled={sidebarPage === "constants"}
                aria-label={sidebarPage === "poses" ? "Export Poses" : "Export Kotlin"}
                title={
                  sidebarPage === "constants"
                    ? "Export unavailable for robot constants"
                    : sidebarPage === "poses"
                      ? "Export Poses"
                      : "Export Kotlin"
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>
              <input
                ref={importInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".kt,text/x-kotlin,text/plain"
                onChange={handleImportKotlin}
              />
              <input
                ref={posesInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".kt,text/x-kotlin,text/plain"
                onChange={handleImportPoses}
              />
              <input
                ref={constantsInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".kt,text/x-kotlin,text/plain"
                onChange={handleImportConstants}
              />
            </div>
          </div>
        </div>

        {sidebarPage === "auton" ? (
          <>
            <div
              ref={pointsListRef}
              className={styles.pointsList}
              onDragOver={handlePointsListDragOver}
              onDragLeave={handlePointsListDragLeave}
              onDrop={() => stopCardDragAutoScroll()}
            >
              {points.map((p, i) => {
                const coords = toFieldCoords(p.nx, p.ny);
                const isDraggablePath = i > 0;
                const isDragOverTarget =
                  isDraggablePath &&
                  draggingPathIndex !== null &&
                  draggingPathIndex !== i &&
                  dragOverPathIndex === i;
                const isBeingDragged = draggingPathIndex === i;
                return (
                  <div
                    key={p.id}
                    className={`${styles.pointCardDragWrapper} ${isDraggablePath ? styles.pointCardDraggable : ""} ${isDragOverTarget ? styles.pointCardDropTarget : ""} ${isBeingDragged ? styles.pointCardDragging : ""}`}
                    draggable={isDraggablePath}
                    onDragStart={(event) => handlePathCardDragStart(i, event)}
                    onDragOver={(event) => handlePathCardDragOver(i, event)}
                    onDrop={(event) => handlePathCardDrop(i, event)}
                    onDragEnd={clearPathCardDragState}
                  >
                    <PointCard
                      index={i}
                      name={p.name ?? `path${i}`}
                      poseName={p.poseName}
                      color={p.color}
                      locked={p.locked}
                      hidden={Boolean(p.hidden)}
                      x={coords.x}
                      y={coords.y}
                      heading={p.heading}
                      headingMode={p.headingMode ?? "constant"}
                      constantHeading={p.constantHeading ?? 0}
                      startHeading={p.startHeading ?? 0}
                      endHeading={p.endHeading ?? 0}
                      controlPoints={(p.controlPoints ?? []).map((controlPoint) => ({
                        id: controlPoint.id,
                        ...toFieldCoords(controlPoint.nx, controlPoint.ny),
                      }))}
                      controlPointCount={(p.controlPoints ?? []).length}
                      controlsExpanded={p.controlsExpanded ?? true}
                      isActive={targetPathIndex(hoverTarget) === i || targetPathIndex(activeTarget) === i}
                      onChange={(axis, val) => handleCoordChange(i, axis, val)}
                      startPoseOptions={i === 0 ? savedPoses.filter((pose) => pose.name.startsWith("START")) : undefined}
                      onStartPoseSelect={i === 0 ? handleStartPoseSelect : undefined}
                      onPositionEditStart={beginPositionEdit}
                      onPositionEditCommit={commitPositionEdit}
                      onRename={i > 0 ? (name) => handleRenamePath(i, name) : undefined}
                      onNameEditStart={beginNameEdit}
                      onNameEditCommit={commitNameEdit}
                      onHeadingChange={i === 0 ? handleHeadingChange : undefined}
                      onInterpolationChange={
                        i > 0 ? (mode) => handlePathInterpolationChange(i, mode) : undefined
                      }
                      onPathHeadingChange={
                        i > 0 ? (field, val) => handlePathHeadingChange(i, field, val) : undefined
                      }
                      onToggleLocked={() => handleToggleLocked(i)}
                      onToggleHidden={(hideOthers) => handleToggleHidden(i, hideOthers)}
                      onToggleControlsExpanded={
                        i > 0 ? () => handleToggleControlsExpanded(i) : undefined
                      }
                      onAddControlPoint={i > 0 ? () => handleAddControlPoint(i) : undefined}
                      onControlPointChange={
                        i > 0
                          ? (controlIndex, axis, val) => handleControlCoordChange(i, controlIndex, axis, val)
                          : undefined
                      }
                      onControlPointEditStart={beginPositionEdit}
                      onControlPointEditCommit={commitPositionEdit}
                      canDelete={isShiftPressed}
                      onDelete={() => handleRemovePoint(i)}
                    />
                  </div>
                );
              })}
            </div>

            <div className={styles.sidebarFooter}>
              <button className={styles.addButton} onClick={handleAddPoint}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Path
              </button>
            </div>
          </>
        ) : sidebarPage === "poses" ? (
          <div className={styles.pointsList}>
            {savedPoses.length > 0 ? (
              savedPoses.map((pose) => (
                <div className={styles.poseCard} key={pose.name}>
                  <div className={styles.poseName}>{pose.name}</div>
                  <div className={styles.poseCoordRow}>
                    <span className={styles.poseCoord}>X {pose.x.toFixed(1)}</span>
                    <span className={styles.poseCoord}>Y {pose.y.toFixed(1)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>No START poses saved.</div>
            )}
          </div>
        ) : (
          <div className={styles.pointsList}>
            <div className={styles.poseCard}>
              <div className={styles.poseName}>Robot Dimensions</div>
              <div className={styles.poseCoordRow}>
                <span className={styles.poseCoord}>Width {robotConstants.width.toFixed(2)}</span>
                <span className={styles.poseCoord}>Length {robotConstants.length.toFixed(2)}</span>
              </div>
            </div>
            <div className={styles.poseCard}>
              <div className={styles.poseName}>Brake Strength</div>
              <div className={styles.poseCoordRow}>
                <span className={styles.poseCoord}>Forward {robotConstants.forwardBrakeStrength.toFixed(5)}</span>
                <span className={styles.poseCoord}>Lateral {robotConstants.lateralBrakeStrength.toFixed(5)}</span>
              </div>
            </div>
            <div className={styles.poseCard}>
              <div className={styles.poseName}>Max Velocity</div>
              <div className={styles.poseCoordRow}>
                <span className={styles.poseCoord}>Forward {robotConstants.maxForwardVelocity.toFixed(5)}</span>
                <span className={styles.poseCoord}>Lateral {robotConstants.maxLateralVelocity.toFixed(5)}</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {kotlinExport && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setKotlinExport(null);
          }}
        >
          <section
            className={styles.exportModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
          >
            <div className={styles.exportModalHeader}>
              <div>
                <h2 id="export-modal-title" className={styles.exportModalTitle}>
                  {kotlinExport.fileName}
                </h2>
                <p className={styles.exportModalSubtitle}>{kotlinExport.subtitle}</p>
              </div>
              <button
                className={styles.secondaryIconButton}
                onClick={() => setKotlinExport(null)}
                aria-label="Close export modal"
                title="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <textarea
              ref={exportTextAreaRef}
              className={styles.exportCode}
              value={kotlinExport.contents}
              readOnly
              spellCheck={false}
              aria-label="Generated Kotlin class file contents"
            />

            <div className={styles.exportModalActions}>
              <span className={styles.copyStatus} aria-live="polite">
                {didCopyExport ? "Copied" : "Select or copy the class text"}
              </span>
              <button className={styles.copyButton} onClick={handleCopyKotlinExport}>
                Copy
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
