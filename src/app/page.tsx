"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FieldImageModal } from "./components/FieldImageModal";
import { FieldCanvas } from "./components/FieldCanvas";
import { KotlinExportModal } from "./components/KotlinExportModal";
import { PlaybackControls } from "./components/PlaybackControls";
import { RecordingSidebar } from "./components/RecordingSidebar";
import { useReplay } from "../tracker/useReplay";
import { PlannerSidebar, type SidebarPage } from "./components/PlannerSidebar";
import { usePlannerState } from "./hooks/usePlannerState";
import {
  serializePathPlannerKotlin,
  parsePathPlannerKotlin,
  parsePedroConstants,
  parseSavedPosesKotlin,
  stripStartPosePrefix,
  DEFAULT_AUTON_ALLIANCE,
  DEFAULT_ROBOT_CONSTANTS,
  type RobotConstants,
  type SavedPose,
} from "./kotlinAutonFile";
import {
  FIELD_BORDER_WIDTH,
  INITIAL_POINT_COLOR,
  INITIAL_POINT_ID,
  POINT_RADIUS,
  POINT_DIAMETER,
} from "./plannerConstants";
import type {
  AutonActionMode,
  AutonAlliance,
  AutonSequenceItem,
  DragTarget,
  FieldSize,
  HeadingInterpolation,
  PathActionTriggerMode,
  PathGeometry,
  PathHeadingField,
  PlannerSnapshot,
  Point,
  SimulationParameters,
} from "./plannerTypes";
import {
  applyPathSegments,
  controlPointHitRadius,
  createForwardPathSegment,
  createDefaultHeadingValues,
  generateId,
  getPreviousPathEndHeading,
  getPathSegments,
  getPathEndTangent,
  headingToNormalizedTangent,
  isSegmentControlLockedByLinearNeighbor,
  isKotlinIdentifierDraft,
  isNumericDraft,
  mainPointHitRadius,
  mirrorAutonPoints,
  normalizeHeading,
  resolvePathSegments,
  targetPathIndex,
  toFieldCoords,
  toNormalizedCoords,
} from "./plannerUtils";
import { seededColor } from "./plannerColors";
import {
  buildPlaybackTimeline,
  clamp01,
  createPlaybackTrackBackground,
  getPlaybackActionMarkers,
  PLAYBACK_ACTION_COLOR,
  getOutOfBoundsPointIds,
  getPathDurationsByPointId,
  getPlaybackPoseAtTime,
  isRobotInsideField,
} from "./playback";
import {
  AUTON_SETTINGS_STORAGE_KEY,
  ROBOT_CONSTANTS_STORAGE_KEY,
  SIMULATION_PARAMETERS_STORAGE_KEY,
  SAVED_POSES_STORAGE_KEY,
  loadAutonDraft,
  loadAutonSettings,
  loadRobotConstants,
  loadSavedPoses,
  loadSimulationParameters,
  DEFAULT_SIMULATION_PARAMETERS,
  saveAutonDraft,
} from "./plannerStorage";
import {
  clearCustomFieldImage,
  createCustomFieldImage,
  DEFAULT_FIELD_IMAGE_SELECTION,
  FIELD_IMAGE_PRESETS,
  loadCustomFieldImage,
  loadFieldImageSelection,
  resolveFieldImageSrc,
  saveCustomFieldImage,
  saveFieldImageSelection,
  type CustomFieldImage,
  type FieldImageSelection,
} from "./fieldImages";
import styles from "./page.module.css";

const AUTON_DRAFT_SAVE_DEBOUNCE_MS = 400;
const CARD_DRAG_SCROLL_ZONE_HEIGHT = 88;
const CARD_DRAG_SCROLL_MAX_SPEED = 22;
const FIELD_BACKGROUND_DOUBLE_CLICK_MS = 500;
const arePointSnapshotsEqual = (a: Point[], b: Point[]) => JSON.stringify(a) === JSON.stringify(b);

export default function PathPlannerPage() {
  const [applicationMode, setApplicationMode] = useState<"planner" | "recording">("planner");
  const [showRecordingTrail, setShowRecordingTrail] = useState(true);
  const [showRecordingPaths, setShowRecordingPaths] = useState(true);
  const replay = useReplay(applicationMode === "recording");
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const [activeTarget, setActiveTarget] = useState<DragTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [fieldSize, setFieldSize] = useState<FieldSize>({ width: 0, height: 0 });
  const [kotlinExport, setKotlinExport] = useState<{ contents: string } | null>(null);
  const [isKotlinExportVisible, setIsKotlinExportVisible] = useState(false);
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [robotConstants, setRobotConstants] = useState<RobotConstants>(DEFAULT_ROBOT_CONSTANTS);
  const [robotDimensionDrafts, setRobotDimensionDrafts] = useState({
    width: DEFAULT_ROBOT_CONSTANTS.width.toFixed(2),
    length: DEFAULT_ROBOT_CONSTANTS.length.toFixed(2),
  });
  const [simulationParameters, setSimulationParameters] = useState<SimulationParameters>(DEFAULT_SIMULATION_PARAMETERS);
  const [simulationParameterDrafts, setSimulationParameterDrafts] = useState({
    translationalAcceleration: DEFAULT_SIMULATION_PARAMETERS.translationalAcceleration.toFixed(1),
    angularAcceleration: DEFAULT_SIMULATION_PARAMETERS.angularAcceleration.toFixed(1),
  });
  const [didLoadStoredSettings, setDidLoadStoredSettings] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [areActionsHidden, setAreActionsHidden] = useState(false);
  const [areControlPointsHidden, setAreControlPointsHidden] = useState(false);
  const [fieldImageSelection, setFieldImageSelection] = useState<FieldImageSelection>(
    DEFAULT_FIELD_IMAGE_SELECTION
  );
  const [customFieldImage, setCustomFieldImage] = useState<CustomFieldImage | null>(null);
  const [fieldImageUploadError, setFieldImageUploadError] = useState<string | null>(null);
  const [isFieldImageUploading, setIsFieldImageUploading] = useState(false);
  const [isFieldImageModalOpen, setIsFieldImageModalOpen] = useState(false);
  const [isFieldImageModalVisible, setIsFieldImageModalVisible] = useState(false);
  const [sidebarPage, setSidebarPage] = useState<SidebarPage>("auton");
  const [draggingPathIndex, setDraggingPathIndex] = useState<number | null>(null);
  const [pathDropGapIndex, setPathDropGapIndex] = useState<number | null>(null);

  const fieldRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const posesInputRef = useRef<HTMLInputElement>(null);
  const constantsInputRef = useRef<HTMLInputElement>(null);
  const fieldImageInputRef = useRef<HTMLInputElement>(null);
  const exportTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const pointsListRef = useRef<HTMLDivElement>(null);
  const dragStartSnapshotRef = useRef<PlannerSnapshot | null>(null);
  const lastFieldBackgroundClickAtRef = useRef<number | null>(null);
  const didPointerDownOnFieldBackgroundRef = useRef(false);
  const shouldFieldImageModalBeVisibleRef = useRef(false);
  const shouldKotlinExportBeVisibleRef = useRef(false);
  const kotlinExportGenerationIdRef = useRef(0);
  const cardDragScrollSpeedRef = useRef(0);
  const cardDragScrollFrameRef = useRef<number | null>(null);
  const sequencePointerDragRef = useRef<{
    pointerId: number;
    index: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const {
    points,
    sequenceItems,
    alliance: autonAlliance,
    undoStack,
    redoStack,
    pointsRef,
    sequenceItemsRef,
    allianceRef,
    undoStackRef,
    redoStackRef,
    setPlannerPoints,
    setPlannerSequenceItems,
    setPlannerAlliance,
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
  } = usePlannerState({
    initialPoints: [
      { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: INITIAL_POINT_COLOR, locked: true, heading: 0 },
    ],
    initialAlliance: DEFAULT_AUTON_ALLIANCE,
    onRestore: () => {
      setHoverTarget(null);
      setActiveTarget(null);
      setIsDragging(false);
      dragStartSnapshotRef.current = null;
    },
  });
  const hasMeasuredField = fieldSize.width > 0 && fieldSize.height > 0;
  const isPointVisible = (index: number) => {
    const previousSegmentVisible = index > 0 && !points[index].hidden;
    const nextSegmentVisible = index < points.length - 1 && !points[index + 1].hidden;
    return previousSegmentVisible || nextSegmentVisible || points.length === 1;
  };

  const getSequenceItemsWithPaths = (items: AutonSequenceItem[], sourcePoints: Point[]) =>
    items.length > 0
      ? items
      : sourcePoints.slice(1).map((point) => ({ id: generateId(), kind: "path" as const, pointId: point.id }));

  const orderedSequenceItems = useMemo(
    () => getSequenceItemsWithPaths(sequenceItems, points),
    [sequenceItems, points]
  );
  const hasActions = orderedSequenceItems.some((item) => item.kind === "action");
  const hasControlPoints = points.some((point, index) =>
    index > 0 && getPathSegments(point).some((segment) => segment.pathGeometry === "spline")
  );

  const playbackTimeline = useMemo(
    () => buildPlaybackTimeline(points, orderedSequenceItems, robotConstants, simulationParameters),
    [orderedSequenceItems, points, robotConstants, simulationParameters]
  );
  const clampedPlaybackTime = Math.min(playbackTime, playbackTimeline.totalTime);

  const { pose: playbackPose, activeSegment: activePlaybackSegment } = useMemo(
    () => getPlaybackPoseAtTime(playbackTimeline, clampedPlaybackTime, points),
    [clampedPlaybackTime, playbackTimeline, points]
  );

  const playbackAccentColor =
    activePlaybackSegment?.kind === "path"
      ? activePlaybackSegment.point.color
      : activePlaybackSegment?.kind === "rotate"
        ? activePlaybackSegment.point.color
        : activePlaybackSegment?.kind === "wait"
          ? PLAYBACK_ACTION_COLOR
          : points[0]?.color ?? INITIAL_POINT_COLOR;

  const pathDurations = useMemo(() => getPathDurationsByPointId(playbackTimeline), [playbackTimeline]);

  const outOfBoundsPointIds = useMemo(
    () =>
      getOutOfBoundsPointIds(playbackTimeline, robotConstants.width, robotConstants.length, points[0]),
    [playbackTimeline, points, robotConstants.length, robotConstants.width]
  );

  const isRobotOutOfBounds = !isRobotInsideField(
    playbackPose,
    robotConstants.width,
    robotConstants.length
  );

  const playbackTrackBackground = useMemo(
    () => createPlaybackTrackBackground(playbackTimeline),
    [playbackTimeline]
  );
  const playbackActionMarkers = useMemo(() => getPlaybackActionMarkers(playbackTimeline), [playbackTimeline]);

  useEffect(() => {
    const handleHistoryKeyDown = (event: globalThis.KeyboardEvent) => {
      if (kotlinExport || applicationMode !== "planner") return;

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
  }, [handleUndo, handleRedo, kotlinExport, applicationMode]);

  useEffect(() => {
    if (!kotlinExport && !isFieldImageModalOpen) return;

    const frame = kotlinExport
      ? requestAnimationFrame(() => {
          exportTextAreaRef.current?.focus();
        })
      : null;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (kotlinExport) {
        kotlinExportGenerationIdRef.current += 1;
        shouldKotlinExportBeVisibleRef.current = false;
        setIsKotlinExportVisible(false);
        return;
      }

      lastFieldBackgroundClickAtRef.current = null;
      didPointerDownOnFieldBackgroundRef.current = false;
      shouldFieldImageModalBeVisibleRef.current = false;
      setIsFieldImageModalVisible(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFieldImageModalOpen, kotlinExport]);

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
  }, [setPlannerPoints]);

  useEffect(() => {
    // Deferred past first paint, but on a timer rather than a frame: a tab that
    // opens in the background never composites, so requestAnimationFrame would
    // leave stored settings unloaded and unsaved until it is first focused.
    const timeoutId = window.setTimeout(() => {
      const storedAutonSettings = loadAutonSettings();
      const storedAutonDraft = loadAutonDraft(storedAutonSettings.alliance);
      const storedCustomFieldImage = loadCustomFieldImage();
      const storedFieldImageSelection = loadFieldImageSelection();
      if (storedAutonDraft) {
        setPlannerSnapshot(storedAutonDraft);
        setPlannerHistory(storedAutonDraft.undoStack ?? [], storedAutonDraft.redoStack ?? []);
      } else {
        setPlannerAlliance(storedAutonSettings.alliance);
      }
      setSavedPoses(loadSavedPoses());
      const storedRobotConstants = loadRobotConstants();
      const storedSimulationParameters = loadSimulationParameters();
      setRobotConstants(storedRobotConstants);
      setSimulationParameters(storedSimulationParameters);
      setCustomFieldImage(storedCustomFieldImage);
      // A stored custom selection is meaningless if the image itself is gone.
      setFieldImageSelection(
        storedFieldImageSelection.kind === "custom" && !storedCustomFieldImage
          ? DEFAULT_FIELD_IMAGE_SELECTION
          : storedFieldImageSelection
      );
      setRobotDimensionDrafts({
        width: storedRobotConstants.width.toFixed(2),
        length: storedRobotConstants.length.toFixed(2),
      });
      setSimulationParameterDrafts({
        translationalAcceleration: storedSimulationParameters.translationalAcceleration.toFixed(1),
        angularAcceleration: storedSimulationParameters.angularAcceleration.toFixed(1),
      });
      setDidLoadStoredSettings(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [setPlannerHistory, setPlannerSnapshot]);

  useEffect(() => {
    const resetFieldBackgroundClick = (event: globalThis.PointerEvent) => {
      const didStartOnFieldBackground = event.target === svgRef.current;
      didPointerDownOnFieldBackgroundRef.current = didStartOnFieldBackground;
      if (!didStartOnFieldBackground) lastFieldBackgroundClickAtRef.current = null;
    };

    document.addEventListener("pointerdown", resetFieldBackgroundClick, true);
    return () => document.removeEventListener("pointerdown", resetFieldBackgroundClick, true);
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

  useEffect(() => {
    if (!didLoadStoredSettings) return;
    window.localStorage.setItem(ROBOT_CONSTANTS_STORAGE_KEY, JSON.stringify(robotConstants));
  }, [didLoadStoredSettings, robotConstants]);

  useEffect(() => {
    if (!didLoadStoredSettings) return;
    window.localStorage.setItem(SIMULATION_PARAMETERS_STORAGE_KEY, JSON.stringify(simulationParameters));
  }, [didLoadStoredSettings, simulationParameters]);

  // Dragging a point fires on every frame, so the draft is only written once the edit settles.
  useEffect(() => {
    if (!didLoadStoredSettings) return;

    const timeoutId = window.setTimeout(() => {
      saveAutonDraft({ points, sequenceItems: orderedSequenceItems, alliance: autonAlliance, undoStack, redoStack });
    }, AUTON_DRAFT_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [didLoadStoredSettings, orderedSequenceItems, points, redoStack, undoStack]);

  useEffect(() => {
    if (!didLoadStoredSettings) return;

    const saveBeforeUnload = () => {
      const currentPoints = pointsRef.current;
      const currentSequenceItems = sequenceItemsRef.current.length > 0
        ? sequenceItemsRef.current
        : currentPoints.slice(1).map((point) => ({
            id: `path-item-${point.id}`,
            kind: "path" as const,
            pointId: point.id,
          }));
      saveAutonDraft({
        points: currentPoints,
        sequenceItems: currentSequenceItems,
        alliance: allianceRef.current,
        undoStack: undoStackRef.current,
        redoStack: redoStackRef.current,
      });
    };

    window.addEventListener("pagehide", saveBeforeUnload);
    return () => window.removeEventListener("pagehide", saveBeforeUnload);
  }, [didLoadStoredSettings, pointsRef, redoStackRef, sequenceItemsRef, undoStackRef]);

  useEffect(() => {
    if (!isPlaybackRunning) return;
    let previousTime: number | null = null;
    let frameId: number;

    const tick = (time: number) => {
      if (previousTime === null) {
        previousTime = time;
        frameId = requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = (time - previousTime) / 1000;
      previousTime = time;
      setPlaybackTime((currentTime) => {
        const nextTime = Math.min(playbackTimeline.totalTime, currentTime + deltaSeconds);
        if (nextTime >= playbackTimeline.totalTime) setIsPlaybackRunning(false);
        return nextTime;
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaybackRunning, playbackTimeline.totalTime]);

  const updateRobotDimension = (key: "width" | "length", value: string) => {
    if (!isNumericDraft(value)) return;
    setRobotDimensionDrafts((currentDrafts) => ({ ...currentDrafts, [key]: value }));
    const parsedValue = Number.parseFloat(value);
    if (!Number.isFinite(parsedValue)) return;
    setRobotConstants((currentConstants) => ({
      ...currentConstants,
      [key]: Math.max(0.1, parsedValue),
    }));
  };

  const formatRobotDimension = (key: "width" | "length") => {
    setRobotDimensionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [key]: robotConstants[key].toFixed(2),
    }));
  };

  const updateSimulationParameter = (key: keyof SimulationParameters, value: string) => {
    if (!isNumericDraft(value)) return;
    setSimulationParameterDrafts((currentDrafts) => ({ ...currentDrafts, [key]: value }));
    const parsedValue = Number.parseFloat(value);
    if (!Number.isFinite(parsedValue)) return;
    setSimulationParameters((currentParameters) => ({
      ...currentParameters,
      [key]: Math.max(0.1, parsedValue),
    }));
  };

  const formatSimulationParameter = (key: keyof SimulationParameters) => {
    setSimulationParameterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [key]: simulationParameters[key].toFixed(1),
    }));
  };

  const saveAutonSettings = (alliance: AutonAlliance) => {
    window.localStorage.setItem(AUTON_SETTINGS_STORAGE_KEY, JSON.stringify({ alliance }));
  };

  const handleAutonAllianceChange = (alliance: AutonAlliance) => {
    if (alliance === allianceRef.current) return;

    pushCurrentSnapshot();
    setPlannerAlliance(alliance);
    saveAutonSettings(alliance);
  };

  const handlePlaybackToggle = () => {
    if (playbackTimeline.totalTime <= 0) return;
    if (playbackTime >= playbackTimeline.totalTime) setPlaybackTime(0);
    setIsPlaybackRunning((currentValue) => !currentValue);
  };

  const handleAddPoint = () => {
    pushCurrentSnapshot();
    const seed = points.length > 0 ? points[points.length - 1] : { nx: 0.5, ny: 0.5 };
    const previousPoint = points.length > 1 ? points[points.length - 2] : null;
    const seedPoint = seed as Point;
    const fallbackHeading = seedPoint.headingMode === "linear"
      ? seedPoint.endHeading ?? 0
      : seedPoint.headingMode === "constant"
        ? seedPoint.constantHeading ?? 0
        : seedPoint.heading ?? 0;
    const pointId = generateId();
    const previousTangent = previousPoint ? getPathEndTangent(previousPoint, seedPoint) : null;
    const initialSegment = createForwardPathSegment(
      seed,
      previousTangent ?? headingToNormalizedTangent(fallbackHeading),
      "spline",
      generateId()
    );
    setPlannerPoints([
      ...points,
      {
        id: pointId,
        name: `path${points.length}`,
        nx: initialSegment.nx,
        ny: initialSegment.ny,
        color: seededColor(pointId),
        locked: false,
        hidden: false,
        ...createDefaultHeadingValues(),
        pathGeometry: initialSegment.pathGeometry,
        segmentId: initialSegment.id,
        startControlOffsetNx: initialSegment.startControlOffsetNx,
        startControlOffsetNy: initialSegment.startControlOffsetNy,
        endControlOffsetNx: initialSegment.endControlOffsetNx,
        endControlOffsetNy: initialSegment.endControlOffsetNy,
      },
    ]);
    setPlannerSequenceItems([
      ...getSequenceItemsWithPaths(sequenceItemsRef.current, pointsRef.current),
      { id: generateId(), kind: "path", pointId },
    ]);
  };

  const handleClearAuton = () => {
    clearHistory();
    if (points.length <= 1 && orderedSequenceItems.length === 0) return;

    setPlannerPoints([
      { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: INITIAL_POINT_COLOR, locked: true, heading: 0 },
    ]);
    setPlannerSequenceItems([]);
    setHoverTarget(null);
    setActiveTarget(null);
    setIsDragging(false);
    setPlaybackTime(0);
    setIsPlaybackRunning(false);
  };

  const handleMirrorAuton = () => {
    const nextPoints = mirrorAutonPoints(pointsRef.current);
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
    setHoverTarget(null);
    setActiveTarget(null);
    setIsDragging(false);
  };

  const handleAddAction = () => {
    pushCurrentSnapshot();
    setPlannerSequenceItems([
      ...getSequenceItemsWithPaths(sequenceItemsRef.current, pointsRef.current),
      { id: generateId(), kind: "action", name: "ACTION", mode: "submit", timeout: 1.0 },
    ]);
  };

  const handleRemovePoint = (index: number) => {
    pushCurrentSnapshot();
    const pointId = points[index]?.id;
    setPlannerPoints(points.filter((_, i) => i !== index));
    if (pointId) {
      setPlannerSequenceItems((currentItems) =>
        currentItems.filter((item) => item.kind !== "path" || item.pointId !== pointId)
      );
    }
    if (targetPathIndex(activeTarget) === index) setActiveTarget(null);
    if (targetPathIndex(hoverTarget) === index) setHoverTarget(null);
  };

  const reorderSequenceItems = (source: AutonSequenceItem[], fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= source.length || toIndex >= source.length) {
      return source;
    }

    const reorderedItems = [...source];
    const [movedItem] = reorderedItems.splice(fromIndex, 1);
    reorderedItems.splice(toIndex, 0, movedItem);
    return reorderedItems;
  };

  const orderPointsFromSequence = (sourcePoints: Point[], items: AutonSequenceItem[]) => {
    const startPoint = sourcePoints[0];
    const pathPointsById = new Map(sourcePoints.slice(1).map((point) => [point.id, point]));
    const orderedPathPoints = items
      .filter((item): item is Extract<AutonSequenceItem, { kind: "path" }> => item.kind === "path")
      .map((item) => pathPointsById.get(item.pointId))
      .filter((point): point is Point => Boolean(point));
    const usedIds = new Set(orderedPathPoints.map((point) => point.id));
    const missingPathPoints = sourcePoints.slice(1).filter((point) => !usedIds.has(point.id));
    return [startPoint, ...orderedPathPoints, ...missingPathPoints];
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
    setPathDropGapIndex(null);
    stopCardDragAutoScroll();
  };

  const isEditableDragTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, select, button, textarea, a, [role='button'], [contenteditable='true'], [data-card-drag-block='true']"
      )
    );

  const sequenceGapAtPointer = (clientY: number) => {
    const cards = pointsListRef.current?.querySelectorAll<HTMLElement>("[data-sequence-index]");
    if (!cards?.length) return null;

    for (const card of cards) {
      const index = Number.parseInt(card.dataset.sequenceIndex ?? "", 10);
      if (!Number.isFinite(index)) continue;
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }

    const lastCard = cards[cards.length - 1];
    const lastIndex = Number.parseInt(lastCard.dataset.sequenceIndex ?? "", 10);
    return Number.isFinite(lastIndex) ? lastIndex + 1 : null;
  };

  const sequenceIndexForDropGap = (fromIndex: number, gapIndex: number) =>
    gapIndex > fromIndex ? gapIndex - 1 : gapIndex;

  const handleSequenceCardPointerDown = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || index < 0 || isEditableDragTarget(event.target)) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    event.preventDefault();
    sequencePointerDragRef.current = {
      pointerId: event.pointerId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSequenceCardPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sequencePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      drag.active = true;
      window.getSelection()?.removeAllRanges();
      setDraggingPathIndex(drag.index);
      setPathDropGapIndex(null);
    }

    event.preventDefault();
    const gapIndex = sequenceGapAtPointer(event.clientY);
    setPathDropGapIndex(gapIndex);
    updateCardDragAutoScrollFromPointer(event.clientY);
  };

  const finishSequencePointerDrag = (event: ReactPointerEvent<HTMLDivElement>, shouldCommit: boolean) => {
    const drag = sequencePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    sequencePointerDragRef.current = null;

    const gapIndex = shouldCommit && drag.active ? sequenceGapAtPointer(event.clientY) : null;
    const targetIndex = gapIndex === null ? null : sequenceIndexForDropGap(drag.index, gapIndex);
    if (targetIndex !== null && targetIndex !== drag.index) {
      const nextSequenceItems = reorderSequenceItems(sequenceItemsRef.current, drag.index, targetIndex);
      const nextPoints = orderPointsFromSequence(pointsRef.current, nextSequenceItems);
      pushCurrentSnapshotIfChanged(nextPoints, nextSequenceItems);
      setPlannerPoints(nextPoints);
      setPlannerSequenceItems(nextSequenceItems);
      setHoverTarget(null);
      setActiveTarget(null);
      setIsDragging(false);
    }
    clearPathCardDragState();
  };

  const handleSequenceCardPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishSequencePointerDrag(event, true);
  };

  const handleSequenceCardPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishSequencePointerDrag(event, false);
  };

  const handleRemoveAction = (itemId: string) => {
    pushCurrentSnapshot();
    setPlannerSequenceItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
  };

  const handleActionNameChange = (itemId: string, name: string) => {
    setPlannerSequenceItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId && item.kind === "action" ? { ...item, name } : item))
    );
  };

  const handleActionModeChange = (itemId: string, mode: AutonActionMode) => {
    pushCurrentSnapshot();
    setPlannerSequenceItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId && item.kind === "action" ? { ...item, mode } : item))
    );
  };

  const handleActionTimeoutChange = (itemId: string, value: string) => {
    const timeout = Number.parseFloat(value);
    if (!Number.isFinite(timeout)) return;

    setPlannerSequenceItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.kind === "action" ? { ...item, timeout: Math.max(0, timeout) } : item
      )
    );
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
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, nx, ny, poseName: index === 0 ? undefined : point.poseName } : point
      )
    );
  };

  const updateSegmentEnd = (pathIndex: number, segmentIndex: number, nx: number, ny: number) => {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) => {
        if (i !== pathIndex) return point;
        const segments = getPathSegments(point).map((segment, index) =>
          index === segmentIndex ? { ...segment, nx, ny, poseName: undefined } : segment
        );
        return applyPathSegments(point, segments);
      })
    );
  };

  const updateSegmentControl = (
    pathIndex: number,
    segmentIndex: number,
    control: "start" | "end",
    nx: number,
    ny: number
  ) => {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) => {
        if (pointIndex !== pathIndex) return point;
        const segments = getPathSegments(point);
        if (isSegmentControlLockedByLinearNeighbor(segments, segmentIndex, control)) return point;
        const resolved = resolvePathSegments(currentPoints[pathIndex - 1], segments)[segmentIndex];
        if (!resolved || segments[segmentIndex]?.pathGeometry !== "spline") return point;

        const offsetNx = control === "start" ? nx - resolved.start.x : resolved.end.x - nx;
        const offsetNy = control === "start" ? ny - resolved.start.y : resolved.end.y - ny;
        const nextSegments = segments.map((segment, index) => {
          if (index === segmentIndex) {
            return control === "start"
              ? { ...segment, startControlOffsetNx: offsetNx, startControlOffsetNy: offsetNy }
              : { ...segment, endControlOffsetNx: offsetNx, endControlOffsetNy: offsetNy };
          }
          if (control === "start" && index === segmentIndex - 1 && segment.pathGeometry === "spline") {
            return { ...segment, endControlOffsetNx: offsetNx, endControlOffsetNy: offsetNy };
          }
          if (control === "end" && index === segmentIndex + 1 && segment.pathGeometry === "spline") {
            return { ...segment, startControlOffsetNx: offsetNx, startControlOffsetNy: offsetNy };
          }
          return segment;
        });
        return applyPathSegments(point, nextSegments);
      })
    );
  };

  const updateTargetPosition = (target: DragTarget, nx: number, ny: number) => {
    if (target.kind === "point") {
      updatePoint(target.index, nx, ny);
    } else if (target.kind === "segmentEnd") {
      updateSegmentEnd(target.pathIndex, target.segmentIndex, nx, ny);
    } else {
      updateSegmentControl(target.pathIndex, target.segmentIndex, target.control, nx, ny);
    }
  };

  const handleToggleControlsExpanded = (index: number) => {
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, controlsExpanded: !(point.controlsExpanded ?? true) } : point
      )
    );
  };

  const handleToggleActionsExpanded = (index: number) => {
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, actionsExpanded: !(point.actionsExpanded ?? true) } : point
      )
    );
  };

  const handleAddControlPoint = (index: number) => {
    const currentPoints = pointsRef.current;
    const previousPoint = currentPoints[index - 1];
    if (!previousPoint || !currentPoints[index]) return;

    const nextPoints = currentPoints.map((point, pointIndex) => {
      if (pointIndex !== index) return point;
      const segments = getPathSegments(point);
      const finalSegment = segments.at(-1)!;
      const fallbackHeading = point.headingMode === "linear"
        ? point.endHeading ?? 0
        : point.headingMode === "constant"
          ? point.constantHeading ?? 0
          : 0;
      const previousTangent = getPathEndTangent(previousPoint, point);
      const nextSegment = createForwardPathSegment(
        finalSegment,
        previousTangent ?? headingToNormalizedTangent(fallbackHeading),
        finalSegment.pathGeometry,
        generateId(),
        previousTangent
      );
      return {
        ...applyPathSegments(point, [
          ...segments,
          nextSegment,
        ]),
        controlsExpanded: true,
      };
    });

    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleControlCoordChange = (
    pathIndex: number,
    controlIndex: number,
    axis: "x" | "y",
    value: string
  ) => {
    const segment = getPathSegments(points[pathIndex])[controlIndex];
    if (!segment) return;

    const currentField = toFieldCoords(segment.nx, segment.ny);
    const num = parseFloat(value);
    if (isNaN(num)) return;

    let newX = currentField.x;
    let newY = currentField.y;

    if (axis === "x") newX = num;
    if (axis === "y") newY = num;

    const { nx, ny } = toNormalizedCoords(newX, newY);
    updateSegmentEnd(pathIndex, controlIndex, nx, ny);
  };

  const handleRemoveControlPoint = (pathIndex: number, controlIndex: number) => {
    if (getPathSegments(pointsRef.current[pathIndex]).length <= 1) return;
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) =>
        pointIndex === pathIndex
          ? applyPathSegments(point, getPathSegments(point).filter((_, index) => index !== controlIndex))
          : point
      )
    );
    if (
      (activeTarget?.kind === "segmentEnd" || activeTarget?.kind === "segmentControl") &&
      activeTarget.pathIndex === pathIndex &&
      activeTarget.segmentIndex === controlIndex
    ) {
      setActiveTarget(null);
    }
    if (
      (hoverTarget?.kind === "segmentEnd" || hoverTarget?.kind === "segmentControl") &&
      hoverTarget.pathIndex === pathIndex &&
      hoverTarget.segmentIndex === controlIndex
    ) {
      setHoverTarget(null);
    }
  };

  const handleReorderControlPoint = (pathIndex: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) => {
        if (pointIndex !== pathIndex) return point;
        const controlPoints = getPathSegments(point);
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= controlPoints.length ||
          toIndex >= controlPoints.length
        ) {
          return point;
        }
        const [movedControlPoint] = controlPoints.splice(fromIndex, 1);
        controlPoints.splice(toIndex, 0, movedControlPoint);
        return applyPathSegments(point, controlPoints);
      })
    );
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

    const savedPose = savedPoses.find((pose) => stripStartPosePrefix(pose.name) === stripStartPosePrefix(poseName));
    if (!savedPose) return;

    const { nx, ny } = toNormalizedCoords(savedPose.x, savedPose.y);
    const nextPoints = pointsRef.current.map((point, index) =>
      index === 0
        ? { ...point, nx, ny, heading: savedPose.heading ?? 0, poseName: stripStartPosePrefix(savedPose.name) }
        : point
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
    const currentPoints = pointsRef.current;
    const defaultStartHeading = mode === "linear"
      ? getPreviousPathEndHeading(currentPoints, index)
      : undefined;
    const nextPoints = currentPoints.map((point, i) =>
      i === index
        ? {
            ...createDefaultHeadingValues(),
            ...point,
            headingMode: mode,
            ...(defaultStartHeading !== undefined ? { startHeading: defaultStartHeading } : {}),
          }
        : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleSegmentGeometryChange = (index: number, segmentIndex: number, pathGeometry: PathGeometry) => {
    const nextPoints = pointsRef.current.map((point, pointIndex) =>
      pointIndex === index
        ? applyPathSegments(
            point,
            getPathSegments(point).map((segment, currentSegmentIndex) =>
              currentSegmentIndex === segmentIndex ? { ...segment, pathGeometry } : segment
            )
          )
        : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
    setHoverTarget(null);
    setActiveTarget(null);
  };

  const handlePathHeadingChange = (index: number, field: PathHeadingField, value: string) => {
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) return;

    const key =
      field === "constant"
        ? "constantHeading"
        : field === "start"
          ? "startHeading"
          : field === "end"
            ? "endHeading"
            : field === "startT"
              ? "linearStartT"
              : "linearEndT";
    const nextValue = field === "startT" || field === "endT" ? clamp01(parsedValue) : normalizeHeading(parsedValue);

    const nextPoints = pointsRef.current.map((point, i) =>
      i === index ? { ...point, [key]: nextValue } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, [key]: nextValue } : point
      )
    );
  };

  const handleMatchPreviousPathHeading = (index: number) => {
    const currentPoints = pointsRef.current;
    const startHeading = getPreviousPathEndHeading(currentPoints, index);
    const nextPoints = currentPoints.map((point, i) =>
      i === index ? { ...point, startHeading } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleAddPathAction = (index: number) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index
          ? {
              ...point,
              actionTriggers: [
                ...(point.actionTriggers ?? []),
                { id: generateId(), mode: "submit", t: 0, actionName: "ACTION" },
              ],
              actionsExpanded: true,
            }
          : point
      )
    );
  };

  const handlePathActionTriggerChange = (
    index: number,
    triggerId: string,
    field: "mode" | "actionName" | "t",
    value: string
  ) => {
    if (field === "actionName" && !isKotlinIdentifierDraft(value)) return;
    if (field === "t" && !isNumericDraft(value)) return;

    const nextPoints = pointsRef.current.map((point, pointIndex) => {
      if (pointIndex !== index) return point;
      const nextTriggers = (point.actionTriggers ?? []).map((trigger) => {
        if (trigger.id !== triggerId) return trigger;
        if (field === "mode") return { ...trigger, mode: value as PathActionTriggerMode };
        if (field === "t") return { ...trigger, t: clamp01(Number.parseFloat(value) || 0) };
        return { ...trigger, actionName: value.toUpperCase() };
      }).sort((a, b) => a.t - b.t);
      return { ...point, actionTriggers: nextTriggers };
    });

    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleRemovePathActionTrigger = (index: number, triggerId: string) => {
    const nextPoints = pointsRef.current.map((point, pointIndex) =>
      pointIndex === index
        ? { ...point, actionTriggers: (point.actionTriggers ?? []).filter((trigger) => trigger.id !== triggerId) }
        : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints(nextPoints);
  };

  const handleExportKotlin = () => {
    const generationId = kotlinExportGenerationIdRef.current + 1;
    kotlinExportGenerationIdRef.current = generationId;
    shouldKotlinExportBeVisibleRef.current = true;
    setKotlinExport({ contents: "// Processing export..." });
    setIsKotlinExportVisible(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (
          kotlinExportGenerationIdRef.current !== generationId ||
          !shouldKotlinExportBeVisibleRef.current
        ) {
          return;
        }

        const contents = serializePathPlannerKotlin(
          points,
          savedPoses,
          getSequenceItemsWithPaths(sequenceItems, points),
          { alliance: autonAlliance }
        );

        if (
          kotlinExportGenerationIdRef.current === generationId &&
          shouldKotlinExportBeVisibleRef.current
        ) {
          setKotlinExport({ contents });
        }
      });
    });
  };

  const handlePathTangentReversedChange = (index: number, tangentReversed: boolean) => {
    const nextPoints = pointsRef.current.map((point, i) =>
      i === index ? { ...point, tangentReversed } : point
    );
    pushCurrentSnapshotIfChanged(nextPoints);
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index ? { ...point, tangentReversed } : point
      )
    );
  };

  const closeKotlinExport = () => {
    kotlinExportGenerationIdRef.current += 1;
    shouldKotlinExportBeVisibleRef.current = false;
    setIsKotlinExportVisible(false);
  };

  const handleCopyKotlinExport = async () => {
    if (!kotlinExport) return;

    exportTextAreaRef.current?.select();
    try {
      await navigator.clipboard.writeText(kotlinExport.contents);
    } catch {
      exportTextAreaRef.current?.focus();
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

  const syncStartPoseFromSavedPoses = (nextSavedPoses: SavedPose[]) => {
    const startPoseName = pointsRef.current[0]?.poseName;
    if (!startPoseName) return;

    const savedPose = nextSavedPoses.find(
      (pose) => stripStartPosePrefix(pose.name) === stripStartPosePrefix(startPoseName)
    );
    if (!savedPose) return;

    const { nx, ny } = toNormalizedCoords(savedPose.x, savedPose.y);
    const nextPoints = pointsRef.current.map((point, index) =>
      index === 0 ? { ...point, nx, ny, heading: savedPose.heading ?? 0 } : point
    );
    if (!arePointSnapshotsEqual(pointsRef.current, nextPoints)) {
      setPlannerPoints(nextPoints);
    }
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
      window.alert("This Kotlin file does not contain an Auton Visualizer export.");
      return;
    }

    clearHistory();
    saveAutonSettings(importedAuton.alliance);
    setPlannerSnapshot(importedAuton);
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
        window.alert("This poses file does not contain any startPose declarations.");
        return;
      }

      setSavedPoses(importedSavedPoses);
      window.localStorage.setItem(SAVED_POSES_STORAGE_KEY, JSON.stringify(importedSavedPoses));
      syncStartPoseFromSavedPoses(importedSavedPoses);
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
      const importedRobotConstants = parsePedroConstants(contents, robotConstants);
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

  const getPointerNormalized = (e: ReactPointerEvent<SVGSVGElement> | globalThis.PointerEvent | globalThis.MouseEvent) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const fieldWidth = rect.width - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    const fieldHeight = rect.height - POINT_DIAMETER - FIELD_BORDER_WIDTH * 2;
    if (fieldWidth <= 0 || fieldHeight <= 0) return null;
    let nx = (e.clientX - rect.left - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldWidth;
    let ny = (e.clientY - rect.top - POINT_RADIUS - FIELD_BORDER_WIDTH) / fieldHeight;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;

    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));

    return { nx, ny };
  };

  const getHitTarget = (nx: number, ny: number) => {
    const minFieldSize = Math.min(
      fieldSize.width - FIELD_BORDER_WIDTH * 2,
      fieldSize.height - FIELD_BORDER_WIDTH * 2
    );
    if (minFieldSize <= 0) return null;

    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].locked) continue;
      if (i > 0 && !points[i].hidden) {
        const segments = getPathSegments(points[i]);
        const resolvedSegments = resolvePathSegments(points[i - 1], segments);
        for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex--) {
          const resolved = resolvedSegments[segmentIndex];
          if (!areControlPointsHidden && resolved.control1 && resolved.control2) {
            for (const [control, handle] of [["start", resolved.control1], ["end", resolved.control2]] as const) {
              if (isSegmentControlLockedByLinearNeighbor(segments, segmentIndex, control)) continue;
              const dx = handle.x - nx;
              const dy = handle.y - ny;
              if (Math.hypot(dx, dy) <= controlPointHitRadius(minFieldSize)) {
                return { kind: "segmentControl", pathIndex: i, segmentIndex, control } as DragTarget;
              }
            }
          }

          const dx = segments[segmentIndex].nx - nx;
          const dy = segments[segmentIndex].ny - ny;
          if (Math.hypot(dx, dy) <= mainPointHitRadius(minFieldSize)) {
            return { kind: "segmentEnd", pathIndex: i, segmentIndex } as DragTarget;
          }
        }
      }
      if (i > 0) continue;
      if (!isPointVisible(i)) continue;

      const dx = points[i].nx - nx;
      const dy = points[i].ny - ny;
      if (Math.sqrt(dx * dx + dy * dy) <= mainPointHitRadius(minFieldSize)) {
        return { kind: "point", index: i } as DragTarget;
      }
    }

    return null;
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pathIndex = targetPathIndex(hoverTarget);
    if (
      hoverTarget !== null &&
      pathIndex !== null &&
      !points[pathIndex].locked &&
      isPointVisible(pathIndex)
    ) {
      dragStartSnapshotRef.current = createSnapshot();
      setIsDragging(true);
      setActiveTarget(hoverTarget);
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isDragging && activeTarget !== null) {
      const normalized = getPointerNormalized(e);
      if (!normalized) return;
      const { nx, ny } = normalized;
      updateTargetPosition(activeTarget, nx, ny);
      return;
    }

    if (!svgRef.current) return;
    const normalized = getPointerNormalized(e);
    if (!normalized) return;
    const { nx, ny } = normalized;
    setHoverTarget(getHitTarget(nx, ny));
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

  const handleFieldClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const didStartOnFieldBackground = didPointerDownOnFieldBackgroundRef.current;
    didPointerDownOnFieldBackgroundRef.current = false;

    if (!didStartOnFieldBackground || isDragging || event.target !== event.currentTarget) {
      lastFieldBackgroundClickAtRef.current = null;
      return;
    }

    const normalized = getPointerNormalized(event.nativeEvent);
    if (!normalized) {
      lastFieldBackgroundClickAtRef.current = null;
      return;
    }

    const { nx, ny } = normalized;
    if (applicationMode === "planner" && getHitTarget(nx, ny) !== null) {
      lastFieldBackgroundClickAtRef.current = null;
      return;
    }

    const lastClickAt = lastFieldBackgroundClickAtRef.current;
    const isSecondFieldBackgroundClick =
      lastClickAt !== null && event.timeStamp - lastClickAt <= FIELD_BACKGROUND_DOUBLE_CLICK_MS;

    if (!isSecondFieldBackgroundClick) {
      lastFieldBackgroundClickAtRef.current = event.timeStamp;
      return;
    }

    lastFieldBackgroundClickAtRef.current = null;
    event.preventDefault();
    shouldFieldImageModalBeVisibleRef.current = true;
    setIsFieldImageModalOpen(true);
    setIsFieldImageModalVisible(true);
  };

  const closeFieldImageModal = () => {
    lastFieldBackgroundClickAtRef.current = null;
    shouldFieldImageModalBeVisibleRef.current = false;
    setIsFieldImageModalVisible(false);
  };

  const fieldImageSrc = resolveFieldImageSrc(fieldImageSelection, customFieldImage);

  const applyFieldImageSelection = (selection: FieldImageSelection) => {
    setFieldImageSelection(selection);
    saveFieldImageSelection(selection);
  };

  const selectFieldPreset = (preset: typeof FIELD_IMAGE_PRESETS[number]) => {
    setFieldImageUploadError(null);
    applyFieldImageSelection({ kind: "preset", id: preset.id });
  };

  const selectCustomFieldImage = () => {
    if (!customFieldImage) return;
    setFieldImageUploadError(null);
    applyFieldImageSelection({ kind: "custom" });
  };

  const removeCustomFieldImage = () => {
    clearCustomFieldImage();
    setCustomFieldImage(null);
    setFieldImageUploadError(null);
    if (fieldImageSelection.kind === "custom") {
      applyFieldImageSelection(DEFAULT_FIELD_IMAGE_SELECTION);
    }
  };

  const handleFieldImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFieldImageUploadError(null);
    setIsFieldImageUploading(true);
    try {
      const uploadedFieldImage = await createCustomFieldImage(file);
      saveCustomFieldImage(uploadedFieldImage);
      setCustomFieldImage(uploadedFieldImage);
      applyFieldImageSelection({ kind: "custom" });
    } catch (error) {
      setFieldImageUploadError(
        error instanceof Error ? error.message : "That image could not be loaded."
      );
    } finally {
      setIsFieldImageUploading(false);
    }
  };

  const changeApplicationMode = (mode: "planner" | "recording") => {
    setIsPlaybackRunning(false);
    replay.pause();
    setApplicationMode(mode);
    setHoverTarget(null);
    setActiveTarget(null);
  };

  return (
    <main className={styles.container}>
      <FieldCanvas
        fieldRef={fieldRef}
        svgRef={svgRef}
        fieldImageSrc={fieldImageSrc}
        fieldSize={fieldSize}
        points={points}
        hoverTarget={hoverTarget}
        isDragging={isDragging}
        hasMeasuredField={hasMeasuredField}
        robotSize={robotConstants}
        isRobotOutOfBounds={isRobotOutOfBounds}
        playbackPose={playbackPose}
        isPointVisible={isPointVisible}
        areControlPointsHidden={areControlPointsHidden}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { if (!isDragging) setHoverTarget(null); }}
        onClick={handleFieldClick}
        recordingView={applicationMode === "recording" ? {
          pose: replay.pose,
          robot: replay.recording?.robot ?? robotConstants,
          trail: replay.trail,
          showTrail: showRecordingTrail,
          paths: replay.paths,
          activePathId: replay.pathProgress?.id,
          showPaths: showRecordingPaths,
        } : undefined}
      />

      <div className={styles.sidebarColumn}>
        <div className={styles.modeTabs} role="tablist" aria-label="Visualizer mode" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const mode = event.key === "Home" ? "planner" : event.key === "End" ? "recording" : applicationMode === "planner" ? "recording" : "planner";
          changeApplicationMode(mode);
          event.currentTarget.querySelector<HTMLButtonElement>(`#${mode}-tab`)?.focus();
        }}>
          <button id="planner-tab" role="tab" aria-selected={applicationMode === "planner"} aria-controls="planner-panel" tabIndex={applicationMode === "planner" ? 0 : -1} onClick={() => changeApplicationMode("planner")}>Pathing</button>
          <button id="recording-tab" role="tab" aria-selected={applicationMode === "recording"} aria-controls="recording-panel" tabIndex={applicationMode === "recording" ? 0 : -1} onClick={() => changeApplicationMode("recording")}>Replay</button>
        </div>
        <div className={styles.modePanel} role="tabpanel" id={`${applicationMode}-panel`} aria-labelledby={`${applicationMode}-tab`}>
        {applicationMode === "planner" ? <>
        <PlannerSidebar
          sidebarPage={sidebarPage}
          points={points}
          sequenceItems={sequenceItems}
          autonAlliance={autonAlliance}
          savedPoses={savedPoses}
          robotConstants={robotConstants}
          robotDimensionDrafts={robotDimensionDrafts}
          simulationParameterDrafts={simulationParameterDrafts}
          hoverTarget={hoverTarget}
          activeTarget={activeTarget}
          undoStackLength={undoStack.length}
          redoStackLength={redoStack.length}
          isShiftPressed={isShiftPressed}
          areActionsHidden={areActionsHidden}
          areControlPointsHidden={areControlPointsHidden}
          hasActions={hasActions}
          hasControlPoints={hasControlPoints}
          draggingPathIndex={draggingPathIndex}
          pathDropGapIndex={pathDropGapIndex}
          importInputRef={importInputRef}
          posesInputRef={posesInputRef}
          constantsInputRef={constantsInputRef}
          pointsListRef={pointsListRef}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onAutonAllianceChange={handleAutonAllianceChange}
          onImportConstantsClick={handleImportConstantsClick}
          onImportPosesClick={handleImportPosesClick}
          onSelectAutonClick={handleSelectAutonClick}
          onExportKotlin={handleExportKotlin}
          onImportKotlin={handleImportKotlin}
          onImportPoses={handleImportPoses}
          onImportConstants={handleImportConstants}
          onSequenceCardPointerDown={handleSequenceCardPointerDown}
          onSequenceCardPointerMove={handleSequenceCardPointerMove}
          onSequenceCardPointerUp={handleSequenceCardPointerUp}
          onSequenceCardPointerCancel={handleSequenceCardPointerCancel}
          onCoordChange={handleCoordChange}
          onStartPoseSelect={handleStartPoseSelect}
          onPositionEditStart={beginPositionEdit}
          onPositionEditCommit={commitPositionEdit}
          onNameEditStart={beginNameEdit}
          onNameEditCommit={commitNameEdit}
          onHeadingChange={handleHeadingChange}
          onRenamePath={handleRenamePath}
          onPathInterpolationChange={handlePathInterpolationChange}
          onSegmentGeometryChange={handleSegmentGeometryChange}
          onPathHeadingChange={handlePathHeadingChange}
          onMatchPreviousPathHeading={handleMatchPreviousPathHeading}
          onPathTangentReversedChange={handlePathTangentReversedChange}
          onToggleActionsExpanded={handleToggleActionsExpanded}
          onAddPathAction={handleAddPathAction}
          onPathActionTriggerChange={handlePathActionTriggerChange}
          onRemovePathActionTrigger={handleRemovePathActionTrigger}
          onToggleLocked={handleToggleLocked}
          onToggleHidden={handleToggleHidden}
          onToggleControlsExpanded={handleToggleControlsExpanded}
          onAddControlPoint={handleAddControlPoint}
          onControlCoordChange={handleControlCoordChange}
          onRemoveControlPoint={handleRemoveControlPoint}
          onReorderControlPoint={handleReorderControlPoint}
          onRemovePoint={handleRemovePoint}
          onActionNameChange={handleActionNameChange}
          onActionModeChange={handleActionModeChange}
          onActionTimeoutChange={handleActionTimeoutChange}
          onRemoveAction={handleRemoveAction}
          onClearAuton={handleClearAuton}
          onMirrorAuton={handleMirrorAuton}
          pathDurations={pathDurations}
          outOfBoundsPointIds={outOfBoundsPointIds}
          onAddPoint={handleAddPoint}
          onAddAction={handleAddAction}
          onToggleControlPointsHidden={() => setAreControlPointsHidden((currentValue) => !currentValue)}
          onToggleActionsHidden={() => setAreActionsHidden((currentValue) => !currentValue)}
          onUpdateRobotDimension={updateRobotDimension}
          onFormatRobotDimension={formatRobotDimension}
          onUpdateSimulationParameter={updateSimulationParameter}
          onFormatSimulationParameter={formatSimulationParameter}
        />
        <PlaybackControls
          isRunning={isPlaybackRunning}
          currentTime={clampedPlaybackTime}
          totalTime={playbackTimeline.totalTime}
          accentColor={playbackAccentColor}
          trackBackground={playbackTrackBackground}
          actionMarkers={playbackActionMarkers}
          onToggle={handlePlaybackToggle}
          onScrub={(time) => {
            setIsPlaybackRunning(false);
            setPlaybackTime(time);
          }}
        />
        </> : <>
          <RecordingSidebar replay={replay} showTrail={showRecordingTrail} onShowTrailChange={setShowRecordingTrail} showPaths={showRecordingPaths} onShowPathsChange={setShowRecordingPaths} />
          <PlaybackControls
            mode="recording"
            disabled={!replay.recording || replay.recording.durationMs <= replay.recording.samples[0].timeMs}
            isRunning={replay.playing}
            currentTime={replay.timeMs / 1000}
            totalTime={(replay.recording?.durationMs ?? 0) / 1000}
            accentColor="#2dd4bf"
            trackBackground="var(--border)"
            onToggle={replay.toggle}
            onScrub={(time) => replay.seek(time * 1000)}
          />
        </>}
        </div>
      </div>

      {isFieldImageModalOpen && (
        <FieldImageModal
          isVisible={isFieldImageModalVisible}
          selection={fieldImageSelection}
          customFieldImage={customFieldImage}
          uploadError={fieldImageUploadError}
          isUploading={isFieldImageUploading}
          fileInputRef={fieldImageInputRef}
          onClose={closeFieldImageModal}
          onFadeOutComplete={() => {
            if (!shouldFieldImageModalBeVisibleRef.current) setIsFieldImageModalOpen(false);
          }}
          onSelectPreset={selectFieldPreset}
          onSelectCustom={selectCustomFieldImage}
          onRemoveCustom={removeCustomFieldImage}
          onUpload={handleFieldImageUpload}
        />
      )}

      {kotlinExport && (
        <KotlinExportModal
          isVisible={isKotlinExportVisible}
          kotlinExport={kotlinExport}
          textAreaRef={exportTextAreaRef}
          onClose={closeKotlinExport}
          onFadeOutComplete={() => {
            if (!shouldKotlinExportBeVisibleRef.current) setKotlinExport(null);
          }}
          onCopy={handleCopyKotlinExport}
        />
      )}
    </main>
  );
}
