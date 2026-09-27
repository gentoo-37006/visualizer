import {
  DEFAULT_AUTON_ALLIANCE,
  DEFAULT_ROBOT_CONSTANTS,
  stripStartPosePrefix,
  type RobotConstants,
  type SavedPose,
} from "./kotlinAutonFile";
import { INITIAL_POINT_ID } from "./plannerConstants";
import { seededColor } from "./plannerColors";
import type {
  AutonActionItem,
  AutonAlliance,
  AutonPathItem,
  AutonSequenceItem,
  ControlPoint,
  HeadingInterpolation,
  PathActionTrigger,
  PersistedPlannerDraft,
  PlannerSnapshot,
  Point,
  SimulationParameters,
} from "./plannerTypes";
import { generateId } from "./plannerUtils";

export const SAVED_POSES_STORAGE_KEY = "auton-visualizer:saved-poses";
export const ROBOT_CONSTANTS_STORAGE_KEY = "auton-visualizer:robot-constants";
export const SIMULATION_PARAMETERS_STORAGE_KEY = "auton-visualizer:simulation-parameters";
export const AUTON_SETTINGS_STORAGE_KEY = "auton-visualizer:auton-settings";
export const AUTON_DRAFT_STORAGE_KEY = "auton-visualizer:auton-draft";

/**
 * Deep enough that no real editing session runs out of undo, and shallow enough
 * that history cannot grow until the draft stops fitting in local storage — a
 * quota failure is silent, so it would cost the whole saved auton.
 */
export const MAX_HISTORY_DEPTH = 100;

export const limitHistoryDepth = <T,>(stack: T[]) =>
  stack.length > MAX_HISTORY_DEPTH ? stack.slice(stack.length - MAX_HISTORY_DEPTH) : stack;

export const DEFAULT_SIMULATION_PARAMETERS: SimulationParameters = {
  translationalAcceleration: 60,
  angularAcceleration: 360,
};

export type AutonSettings = {
  alliance: AutonAlliance;
};

export const DEFAULT_AUTON_SETTINGS: AutonSettings = {
  alliance: DEFAULT_AUTON_ALLIANCE,
};

const isSavedPoseArray = (value: unknown): value is SavedPose[] =>
  Array.isArray(value) &&
  value.every(
    (pose) =>
      typeof pose?.name === "string" &&
      (typeof pose?.kotlinName === "string" || pose?.kotlinName === undefined) &&
      typeof pose?.x === "number" &&
      typeof pose?.y === "number" &&
      (typeof pose?.heading === "number" || pose?.heading === undefined)
  );

export const loadSavedPoses = () => {
  if (typeof window === "undefined") return [];

  const storedSavedPoses = window.localStorage.getItem(SAVED_POSES_STORAGE_KEY);
  if (!storedSavedPoses) return [];

  try {
    const parsedSavedPoses: unknown = JSON.parse(storedSavedPoses);
    return isSavedPoseArray(parsedSavedPoses)
      ? parsedSavedPoses.map((pose) => ({
          ...pose,
          heading: pose.heading ?? 0,
          name: stripStartPosePrefix(pose.name),
        }))
      : [];
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
  typeof (value as RobotConstants).maxAchievableForwardVelocity === "number" &&
  typeof (value as RobotConstants).maxAchievableStrafeVelocity === "number" &&
  typeof (value as RobotConstants).naturalForwardDeceleration === "number" &&
  typeof (value as RobotConstants).naturalStrafeDeceleration === "number";

export const loadRobotConstants = () => {
  if (typeof window === "undefined") return DEFAULT_ROBOT_CONSTANTS;

  const storedRobotConstants = window.localStorage.getItem(ROBOT_CONSTANTS_STORAGE_KEY);
  if (!storedRobotConstants) return DEFAULT_ROBOT_CONSTANTS;

  try {
    const parsedRobotConstants: unknown = JSON.parse(storedRobotConstants);
    return isRobotConstants(parsedRobotConstants)
      ? { ...DEFAULT_ROBOT_CONSTANTS, ...parsedRobotConstants }
      : DEFAULT_ROBOT_CONSTANTS;
  } catch {
    window.localStorage.removeItem(ROBOT_CONSTANTS_STORAGE_KEY);
    return DEFAULT_ROBOT_CONSTANTS;
  }
};

const isSimulationParameters = (value: unknown): value is SimulationParameters =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as SimulationParameters).translationalAcceleration === "number" &&
  typeof (value as SimulationParameters).angularAcceleration === "number";

export const loadSimulationParameters = () => {
  if (typeof window === "undefined") return DEFAULT_SIMULATION_PARAMETERS;
  const stored = window.localStorage.getItem(SIMULATION_PARAMETERS_STORAGE_KEY);
  if (!stored) return DEFAULT_SIMULATION_PARAMETERS;

  try {
    const parsed: unknown = JSON.parse(stored);
    return isSimulationParameters(parsed)
      ? { ...DEFAULT_SIMULATION_PARAMETERS, ...parsed }
      : DEFAULT_SIMULATION_PARAMETERS;
  } catch {
    window.localStorage.removeItem(SIMULATION_PARAMETERS_STORAGE_KEY);
    return DEFAULT_SIMULATION_PARAMETERS;
  }
};

const isAutonSettings = (value: unknown): value is AutonSettings =>
  typeof value === "object" &&
  value !== null &&
  ((value as AutonSettings).alliance === "BLUE" || (value as AutonSettings).alliance === "RED");

export const loadAutonSettings = () => {
  if (typeof window === "undefined") return DEFAULT_AUTON_SETTINGS;

  const storedAutonSettings = window.localStorage.getItem(AUTON_SETTINGS_STORAGE_KEY);
  if (!storedAutonSettings) return DEFAULT_AUTON_SETTINGS;

  try {
    const parsedAutonSettings: unknown = JSON.parse(storedAutonSettings);
    return isAutonSettings(parsedAutonSettings)
      ? { ...DEFAULT_AUTON_SETTINGS, ...parsedAutonSettings }
      : DEFAULT_AUTON_SETTINGS;
  } catch {
    window.localStorage.removeItem(AUTON_SETTINGS_STORAGE_KEY);
    return DEFAULT_AUTON_SETTINGS;
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sanitizeNormalized = (value: unknown) =>
  isFiniteNumber(value) ? Math.max(0, Math.min(1, value)) : null;

const sanitizeControlPoint = (value: unknown): ControlPoint | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ControlPoint>;
  const nx = sanitizeNormalized(candidate.nx);
  const ny = sanitizeNormalized(candidate.ny);
  if (nx === null || ny === null) return null;

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : generateId(),
    nx,
    ny,
    ...(typeof candidate.poseName === "string" ? { poseName: candidate.poseName } : {}),
    ...(candidate.pathGeometry === "linear" || candidate.pathGeometry === "spline"
      ? { pathGeometry: candidate.pathGeometry }
      : {}),
    ...(isFiniteNumber(candidate.startControlOffsetNx) ? { startControlOffsetNx: candidate.startControlOffsetNx } : {}),
    ...(isFiniteNumber(candidate.startControlOffsetNy) ? { startControlOffsetNy: candidate.startControlOffsetNy } : {}),
    ...(isFiniteNumber(candidate.endControlOffsetNx) ? { endControlOffsetNx: candidate.endControlOffsetNx } : {}),
    ...(isFiniteNumber(candidate.endControlOffsetNy) ? { endControlOffsetNy: candidate.endControlOffsetNy } : {}),
    ...(isFiniteNumber(candidate.controlOffsetNx) ? { controlOffsetNx: candidate.controlOffsetNx } : {}),
    ...(isFiniteNumber(candidate.controlOffsetNy) ? { controlOffsetNy: candidate.controlOffsetNy } : {}),
  };
};

const sanitizeActionTrigger = (value: unknown): PathActionTrigger | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<PathActionTrigger>;
  if (candidate.mode !== "submit" && candidate.mode !== "remove") return null;
  if (typeof candidate.actionName !== "string") return null;

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : generateId(),
    mode: candidate.mode,
    t: isFiniteNumber(candidate.t) ? Math.max(0, Math.min(1, candidate.t)) : 0,
    actionName: candidate.actionName,
  };
};

const sanitizeHeadingMode = (value: unknown): HeadingInterpolation | undefined =>
  value === "constant" || value === "linear" || value === "tangential" ? value : undefined;

const optionalNumber = (value: unknown) => (isFiniteNumber(value) ? { value } : null);

/** Rebuilds a stored point from known fields so unexpected JSON can never reach React state. */
const sanitizePoint = (value: unknown, index: number): Point | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<Point>;
  const nx = sanitizeNormalized(candidate.nx);
  const ny = sanitizeNormalized(candidate.ny);
  if (nx === null || ny === null) return null;

  const id = index === 0 ? INITIAL_POINT_ID : typeof candidate.id === "string" && candidate.id ? candidate.id : generateId();
  const constantHeading = optionalNumber(candidate.constantHeading);
  const startHeading = optionalNumber(candidate.startHeading);
  const endHeading = optionalNumber(candidate.endHeading);
  const linearStartT = sanitizeNormalized(candidate.linearStartT);
  const linearEndT = sanitizeNormalized(candidate.linearEndT);
  const heading = optionalNumber(candidate.heading);
  const headingMode = sanitizeHeadingMode(candidate.headingMode);
  const sanitizedSegments = Array.isArray(candidate.controlPoints)
    ? candidate.controlPoints.map(sanitizeControlPoint).filter((segment): segment is ControlPoint => segment !== null)
    : [];
  const usesSegmentSchema = sanitizedSegments.some((segment) => segment.pathGeometry !== undefined);
  const pathGeometry = candidate.pathGeometry === "linear" || candidate.pathGeometry === "spline"
    ? candidate.pathGeometry
    : "spline";
  const migratedSegments = usesSegmentSchema
    ? sanitizedSegments
    : sanitizedSegments.map((segment, segmentIndex) => {
        const previousLegacyNode = sanitizedSegments[segmentIndex - 1];
        return {
          ...segment,
          pathGeometry,
          startControlOffsetNx: segmentIndex === 0
            ? candidate.startControlOffsetNx
            : previousLegacyNode?.controlOffsetNx,
          startControlOffsetNy: segmentIndex === 0
            ? candidate.startControlOffsetNy
            : previousLegacyNode?.controlOffsetNy,
          endControlOffsetNx: segment.controlOffsetNx,
          endControlOffsetNy: segment.controlOffsetNy,
        };
      });
  const finalLegacyNode = usesSegmentSchema ? undefined : sanitizedSegments.at(-1);

  return {
    id,
    nx,
    ny,
    color: typeof candidate.color === "string" && candidate.color ? candidate.color : seededColor(id),
    locked: index === 0 ? true : candidate.locked === true,
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(typeof candidate.poseName === "string" ? { poseName: candidate.poseName } : {}),
    ...(candidate.hidden === true ? { hidden: true } : {}),
    ...(heading ? { heading: heading.value } : {}),
    ...(headingMode ? { headingMode } : {}),
    ...(constantHeading ? { constantHeading: constantHeading.value } : {}),
    ...(startHeading ? { startHeading: startHeading.value } : {}),
    ...(endHeading ? { endHeading: endHeading.value } : {}),
    ...(linearStartT !== null ? { linearStartT } : {}),
    ...(linearEndT !== null ? { linearEndT } : {}),
    ...(candidate.tangentReversed === true ? { tangentReversed: true } : {}),
    ...(index > 0 ? { pathGeometry } : {}),
    ...(typeof candidate.segmentId === "string" && candidate.segmentId ? { segmentId: candidate.segmentId } : {}),
    ...(isFiniteNumber(finalLegacyNode?.controlOffsetNx ?? candidate.startControlOffsetNx)
      ? { startControlOffsetNx: finalLegacyNode?.controlOffsetNx ?? candidate.startControlOffsetNx }
      : {}),
    ...(isFiniteNumber(finalLegacyNode?.controlOffsetNy ?? candidate.startControlOffsetNy)
      ? { startControlOffsetNy: finalLegacyNode?.controlOffsetNy ?? candidate.startControlOffsetNy }
      : {}),
    ...(isFiniteNumber(candidate.endControlOffsetNx)
      ? { endControlOffsetNx: candidate.endControlOffsetNx }
      : {}),
    ...(isFiniteNumber(candidate.endControlOffsetNy)
      ? { endControlOffsetNy: candidate.endControlOffsetNy }
      : {}),
    ...(migratedSegments.length > 0 ? { controlPoints: migratedSegments } : {}),
    ...(typeof candidate.controlsExpanded === "boolean" ? { controlsExpanded: candidate.controlsExpanded } : {}),
    ...(typeof candidate.actionsExpanded === "boolean" ? { actionsExpanded: candidate.actionsExpanded } : {}),
    ...(Array.isArray(candidate.actionTriggers)
      ? {
          actionTriggers: candidate.actionTriggers
            .map(sanitizeActionTrigger)
            .filter((trigger): trigger is PathActionTrigger => trigger !== null)
            .sort((a, b) => a.t - b.t),
        }
      : {}),
  };
};

/**
 * `unclaimedPointIds` is consumed, not just read: a path point owns exactly one
 * sequence entry, so the first entry claiming a point takes it and any later
 * entry naming it again is dropped. Two entries on one point would otherwise
 * splice that point into the list twice the next time the sequence is reordered.
 */
const sanitizeSequenceItem = (value: unknown, unclaimedPointIds: Set<string>): AutonSequenceItem | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<Omit<AutonActionItem, "kind">> &
    Partial<Omit<AutonPathItem, "kind">> & { kind?: unknown };
  const id = typeof candidate.id === "string" && candidate.id ? candidate.id : generateId();

  if (candidate.kind === "path") {
    return typeof candidate.pointId === "string" && unclaimedPointIds.delete(candidate.pointId)
      ? { id, kind: "path", pointId: candidate.pointId }
      : null;
  }

  if (candidate.kind !== "action") return null;
  if (candidate.mode !== "submit" && candidate.mode !== "run" && candidate.mode !== "remove") return null;

  return {
    id,
    kind: "action",
    name: typeof candidate.name === "string" ? candidate.name : "ACTION",
    mode: candidate.mode,
    timeout: isFiniteNumber(candidate.timeout) ? Math.max(0, candidate.timeout) : 0,
  };
};

const sanitizeAlliance = (value: unknown, fallback: AutonAlliance): AutonAlliance =>
  value === "BLUE" || value === "RED" ? value : fallback;

const sanitizePlannerSnapshot = (value: unknown, fallbackAlliance: AutonAlliance): PlannerSnapshot | null => {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Partial<PlannerSnapshot>;
  if (!Array.isArray(candidate.points)) return null;

  const points = candidate.points
    .map((point, index) => sanitizePoint(point, index))
    .filter((point): point is Point => point !== null);
  if (points.length === 0 || points[0].id !== INITIAL_POINT_ID) return null;

  // Path points can only be reordered through the sequence, so the two lists have to agree.
  const unclaimedPointIds = new Set(points.slice(1).map((point) => point.id));
  const storedItems = Array.isArray(candidate.sequenceItems) ? candidate.sequenceItems : [];
  const sequenceItems = storedItems
    .map((item) => sanitizeSequenceItem(item, unclaimedPointIds))
    .filter((item): item is AutonSequenceItem => item !== null);
  const referencedPointIds = new Set(
    sequenceItems.filter((item) => item.kind === "path").map((item) => item.pointId)
  );
  points.slice(1).forEach((point) => {
    if (referencedPointIds.has(point.id)) return;
    sequenceItems.push({ id: generateId(), kind: "path", pointId: point.id });
  });

  return { points, sequenceItems, alliance: sanitizeAlliance(candidate.alliance, fallbackAlliance) };
};

/**
 * `fallbackAlliance` covers drafts written before the alliance became part of a
 * snapshot: without it every one of them would silently come back as BLUE.
 */
export const loadAutonDraft = (
  fallbackAlliance: AutonAlliance = DEFAULT_AUTON_ALLIANCE
): PersistedPlannerDraft | null => {
  if (typeof window === "undefined") return null;

  const storedDraft = window.localStorage.getItem(AUTON_DRAFT_STORAGE_KEY);
  if (!storedDraft) return null;

  try {
    const parsedDraft: unknown = JSON.parse(storedDraft);
    const snapshot = sanitizePlannerSnapshot(parsedDraft, fallbackAlliance);
    if (!snapshot || typeof parsedDraft !== "object" || parsedDraft === null) return null;

    const candidate = parsedDraft as { undoStack?: unknown; redoStack?: unknown };
    const sanitizeHistoryStack = (stack: unknown) =>
      Array.isArray(stack)
        ? limitHistoryDepth(
            stack
              .map((entry) => sanitizePlannerSnapshot(entry, fallbackAlliance))
              .filter((entry): entry is PlannerSnapshot => entry !== null)
          )
        : undefined;
    // Trims a draft written before the cap existed, so it shrinks on first load
    // rather than only once the next edit pushes onto it.
    const undoStack = sanitizeHistoryStack(candidate.undoStack);
    const redoStack = sanitizeHistoryStack(candidate.redoStack);

    return {
      ...snapshot,
      ...(undoStack ? { undoStack } : {}),
      ...(redoStack ? { redoStack } : {}),
    };
  } catch {
    window.localStorage.removeItem(AUTON_DRAFT_STORAGE_KEY);
    return null;
  }
};

export const saveAutonDraft = (snapshot: PersistedPlannerDraft) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(AUTON_DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    return;
  } catch {
    // A full quota (usually a large custom field image) must not break editing.
  }

  // History is the bulk of a draft and the part worth least: losing undo beats
  // losing the auton, so try again with just the routine itself.
  try {
    const { points, sequenceItems, alliance } = snapshot;
    window.localStorage.setItem(
      AUTON_DRAFT_STORAGE_KEY,
      JSON.stringify({ points, sequenceItems, alliance })
    );
  } catch {
    // Nothing else to give up; the draft stays in memory for this session.
  }
};
