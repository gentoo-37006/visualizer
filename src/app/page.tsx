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
import { PlannerSidebar, type SidebarPage } from "./components/PlannerSidebar";
import { usePlannerState } from "./hooks/usePlannerState";
import {
  serializePathPlannerKotlin,
  serializeSavedPosesKotlin,
  parsePathPlannerKotlin,
  parseRobotConstantsKotlin,
  parseSavedPosesKotlin,
  stripStartPosePrefix,
  DEFAULT_AUTON_ALLIANCE,
  DEFAULT_ROBOT_CONSTANTS,
  type RobotConstants,
  type SavedPose,
} from "./kotlinAutonFile";
import {
  FIELD_SIZE_INCHES,
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
  MotionParameters,
  PathActionTriggerMode,
  PathHeadingField,
  PlannerSnapshot,
  Point,
} from "./plannerTypes";
import {
  controlPointHitRadius,
  createDefaultHeadingValues,
  generateId,
  isKotlinIdentifierDraft,
  isNumericDraft,
  mainPointHitRadius,
  nextPointPlacement,
  normalizeHeading,
  targetPathIndex,
  toFieldCoords,
  toNormalizedCoords,
  toSvgPixelCoords,
} from "./plannerUtils";
import { seededColor } from "./plannerColors";
import {
  buildPlaybackTimeline,
  clamp01,
  createPlaybackTrackBackground,
  getPlaybackPoseAtTime,
  snapSvgPixel,
} from "./playback";
import {
  DEFAULT_MOTION_PARAMETERS,
  AUTON_SETTINGS_STORAGE_KEY,
  MOTION_PARAMETERS_STORAGE_KEY,
  ROBOT_CONSTANTS_STORAGE_KEY,
  SAVED_POSES_STORAGE_KEY,
  loadAutonDraft,
  loadAutonSettings,
  loadMotionParameters,
  loadRobotConstants,
  loadSavedPoses,
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
  const [hoverTarget, setHoverTarget] = useState<DragTarget | null>(null);
  const [activeTarget, setActiveTarget] = useState<DragTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [fieldSize, setFieldSize] = useState<FieldSize>({ width: 0, height: 0 });
  const [kotlinExport, setKotlinExport] = useState<{ contents: string } | null>(null);
  const [isKotlinExportVisible, setIsKotlinExportVisible] = useState(false);
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [autonAlliance, setAutonAlliance] = useState<AutonAlliance>(DEFAULT_AUTON_ALLIANCE);
  const [robotConstants, setRobotConstants] = useState<RobotConstants>(DEFAULT_ROBOT_CONSTANTS);
  const [motionParameters, setMotionParameters] = useState<MotionParameters>(DEFAULT_MOTION_PARAMETERS);
  const [motionParameterDrafts, setMotionParameterDrafts] = useState({
    maxAngularVelocity: String(DEFAULT_MOTION_PARAMETERS.maxAngularVelocity),
    maxForwardAcceleration: String(DEFAULT_MOTION_PARAMETERS.maxForwardAcceleration),
    maxLateralAcceleration: String(DEFAULT_MOTION_PARAMETERS.maxLateralAcceleration),
  });
  const [didLoadStoredSettings, setDidLoadStoredSettings] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [areActionsHidden, setAreActionsHidden] = useState(false);
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
  } = usePlannerState({
    initialPoints: [
      { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: INITIAL_POINT_COLOR, locked: true, heading: 0 },
    ],
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

  const playbackTimeline = useMemo(
    () => buildPlaybackTimeline(points, orderedSequenceItems, robotConstants, motionParameters),
    [motionParameters, orderedSequenceItems, points, robotConstants]
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
        ? activePlaybackSegment.color
        : activePlaybackSegment?.pose.color ?? points[0]?.color ?? INITIAL_POINT_COLOR;

  const playbackTrackBackground = useMemo(
    () => createPlaybackTrackBackground(playbackTimeline),
    [playbackTimeline]
  );

  const robotSvgFrame = useMemo(() => {
    const safeNx = Number.isFinite(playbackPose.nx) ? clamp01(playbackPose.nx) : 0.5;
    const safeNy = Number.isFinite(playbackPose.ny) ? clamp01(playbackPose.ny) : 0.5;
    const safeRobotWidth =
      Number.isFinite(robotConstants.width) && robotConstants.width > 0
        ? robotConstants.width
        : DEFAULT_ROBOT_CONSTANTS.width;
    const safeRobotLength =
      Number.isFinite(robotConstants.length) && robotConstants.length > 0
        ? robotConstants.length
        : DEFAULT_ROBOT_CONSTANTS.length;
    const center = toSvgPixelCoords(safeNx, safeNy, fieldSize);
    const innerFieldWidth = Math.max(1, fieldSize.width - FIELD_BORDER_WIDTH * 2);
    const innerFieldHeight = Math.max(1, fieldSize.height - FIELD_BORDER_WIDTH * 2);
    const width = (safeRobotWidth / FIELD_SIZE_INCHES) * innerFieldWidth;
    const height = (safeRobotLength / FIELD_SIZE_INCHES) * innerFieldHeight;
    const x = snapSvgPixel(center.x - width / 2);
    const y = snapSvgPixel(center.y - height / 2);
    const snappedWidth = Math.max(1, snapSvgPixel(width));
    const snappedHeight = Math.max(1, snapSvgPixel(height));

    return {
      x,
      y,
      width: snappedWidth,
      height: snappedHeight,
      centerX: x + snappedWidth / 2,
      centerY: y + snappedHeight / 2,
    };
  }, [fieldSize, playbackPose.nx, playbackPose.ny, robotConstants.length, robotConstants.width]);

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
      const storedMotionParameters = loadMotionParameters();
      const storedAutonSettings = loadAutonSettings();
      const storedAutonDraft = loadAutonDraft();
      const storedCustomFieldImage = loadCustomFieldImage();
      const storedFieldImageSelection = loadFieldImageSelection();
      setAutonAlliance(storedAutonSettings.alliance);
      if (storedAutonDraft) {
        setPlannerSnapshot(storedAutonDraft);
        setPlannerHistory(storedAutonDraft.undoStack ?? [], storedAutonDraft.redoStack ?? []);
      }
      setSavedPoses(loadSavedPoses());
      setRobotConstants(loadRobotConstants());
      setMotionParameters(storedMotionParameters);
      setCustomFieldImage(storedCustomFieldImage);
      // A stored custom selection is meaningless if the image itself is gone.
      setFieldImageSelection(
        storedFieldImageSelection.kind === "custom" && !storedCustomFieldImage
          ? DEFAULT_FIELD_IMAGE_SELECTION
          : storedFieldImageSelection
      );
      setMotionParameterDrafts({
        maxAngularVelocity: String(storedMotionParameters.maxAngularVelocity),
        maxForwardAcceleration: String(storedMotionParameters.maxForwardAcceleration),
        maxLateralAcceleration: String(storedMotionParameters.maxLateralAcceleration),
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
    window.localStorage.setItem(MOTION_PARAMETERS_STORAGE_KEY, JSON.stringify(motionParameters));
  }, [didLoadStoredSettings, motionParameters]);

  // Dragging a point fires on every frame, so the draft is only written once the edit settles.
  useEffect(() => {
    if (!didLoadStoredSettings) return;

    const timeoutId = window.setTimeout(() => {
      saveAutonDraft({ points, sequenceItems: orderedSequenceItems, undoStack, redoStack });
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

  const updateMotionParameter = (key: keyof MotionParameters, value: string) => {
    if (!isNumericDraft(value)) return;
    setMotionParameterDrafts((currentDrafts) => ({ ...currentDrafts, [key]: value }));
    const parsedValue = Number.parseFloat(value);
    if (!Number.isFinite(parsedValue)) return;
    setMotionParameters((currentParameters) => ({
      ...currentParameters,
      [key]: Math.max(0.1, parsedValue),
    }));
  };

  const formatMotionParameter = (key: keyof MotionParameters) => {
    setMotionParameterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [key]: motionParameters[key].toFixed(1),
    }));
  };

  const saveAutonSettings = (alliance: AutonAlliance) => {
    window.localStorage.setItem(AUTON_SETTINGS_STORAGE_KEY, JSON.stringify({ alliance }));
  };

  const handleAutonAllianceChange = (alliance: AutonAlliance) => {
    setAutonAlliance(alliance);
    saveAutonSettings(alliance);
  };

  const handlePlaybackToggle = () => {
    if (playbackTimeline.totalTime <= 0) return;
    if (playbackTime >= playbackTimeline.totalTime) setPlaybackTime(0);
    setIsPlaybackRunning((currentValue) => !currentValue);
  };

  const handleAddPoint = () => {
    pushCurrentSnapshot();
    const placement = nextPointPlacement(points);
    const pointId = generateId();
    setPlannerPoints([
      ...points,
      {
        id: pointId,
        name: `path${points.length}`,
        nx: placement.nx,
        ny: placement.ny,
        color: seededColor(pointId),
        locked: false,
        hidden: false,
        ...createDefaultHeadingValues(),
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

  const handleAddAction = () => {
    pushCurrentSnapshot();
    setPlannerSequenceItems([
      ...getSequenceItemsWithPaths(sequenceItemsRef.current, pointsRef.current),
      { id: generateId(), kind: "action", name: "ACTION", mode: "start", timeout: 1.0 },
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

  const updateControlPoint = (pathIndex: number, controlIndex: number, nx: number, ny: number) => {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
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

  const handleRemoveControlPoint = (pathIndex: number, controlIndex: number) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) =>
        pointIndex === pathIndex
          ? {
              ...point,
              controlPoints: (point.controlPoints ?? []).filter((_, index) => index !== controlIndex),
            }
          : point
      )
    );
    if (activeTarget?.kind === "control" && activeTarget.pathIndex === pathIndex && activeTarget.controlIndex === controlIndex) {
      setActiveTarget(null);
    }
    if (hoverTarget?.kind === "control" && hoverTarget.pathIndex === pathIndex && hoverTarget.controlIndex === controlIndex) {
      setHoverTarget(null);
    }
  };

  const handleReorderControlPoint = (pathIndex: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) => {
        if (pointIndex !== pathIndex) return point;
        const controlPoints = [...(point.controlPoints ?? [])];
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
        return { ...point, controlPoints };
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

  const handleAddPathAction = (index: number) => {
    pushCurrentSnapshot();
    setPlannerPoints((currentPoints) =>
      currentPoints.map((point, i) =>
        i === index
          ? {
              ...point,
              actionTriggers: [
                ...(point.actionTriggers ?? []),
                { id: generateId(), mode: "start", t: 0, actionName: "ACTION" },
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

        const contents = sidebarPage === "poses"
          ? serializeSavedPosesKotlin(savedPoses, robotConstants)
          : serializePathPlannerKotlin(
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
    setAutonAlliance(importedAuton.alliance);
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
        window.alert("This poses file does not contain any START poses.");
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
      const controlPoints = points[i].controlPoints ?? [];
      if (!points[i].hidden) {
        for (let j = controlPoints.length - 1; j >= 0; j--) {
          const dx = controlPoints[j].nx - nx;
          const dy = controlPoints[j].ny - ny;
          if (Math.sqrt(dx * dx + dy * dy) <= controlPointHitRadius(minFieldSize)) {
            return { kind: "control", pathIndex: i, controlIndex: j } as DragTarget;
          }
        }
      }
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
    if (getHitTarget(nx, ny) !== null) {
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
        robotSvgFrame={robotSvgFrame}
        playbackPose={playbackPose}
        isPointVisible={isPointVisible}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { if (!isDragging) setHoverTarget(null); }}
        onClick={handleFieldClick}
      />

      <div className={styles.sidebarColumn}>
        <PlannerSidebar
          sidebarPage={sidebarPage}
          points={points}
          sequenceItems={sequenceItems}
          autonAlliance={autonAlliance}
          savedPoses={savedPoses}
          robotConstants={robotConstants}
          motionParameterDrafts={motionParameterDrafts}
          hoverTarget={hoverTarget}
          activeTarget={activeTarget}
          undoStackLength={undoStack.length}
          redoStackLength={redoStack.length}
          isShiftPressed={isShiftPressed}
          areActionsHidden={areActionsHidden}
          hasActions={hasActions}
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
          onPathHeadingChange={handlePathHeadingChange}
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
          onAddPoint={handleAddPoint}
          onAddAction={handleAddAction}
          onToggleActionsHidden={() => setAreActionsHidden((currentValue) => !currentValue)}
          onUpdateMotionParameter={updateMotionParameter}
          onFormatMotionParameter={formatMotionParameter}
        />
        <PlaybackControls
          isRunning={isPlaybackRunning}
          currentTime={clampedPlaybackTime}
          totalTime={playbackTimeline.totalTime}
          accentColor={playbackAccentColor}
          trackBackground={playbackTrackBackground}
          onToggle={handlePlaybackToggle}
          onScrub={(time) => {
            setIsPlaybackRunning(false);
            setPlaybackTime(time);
          }}
        />
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
