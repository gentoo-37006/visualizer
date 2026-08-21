export type ControlPoint = {
  id: string;
  nx: number;
  ny: number;
  poseName?: string;
};

export type HeadingInterpolation = "constant" | "linear" | "tangential";
export type PathHeadingField = "constant" | "start" | "end" | "startT" | "endT";
export type AutonActionMode = "start" | "run" | "stop";
export type AutonAlliance = "BLUE" | "RED";
export type PathActionTriggerMode = "start" | "stop";

export type PathActionTrigger = {
  id: string;
  mode: PathActionTriggerMode;
  t: number;
  actionName: string;
};

export type Point = {
  id: string;
  name?: string;
  nx: number;
  ny: number;
  color: string;
  locked: boolean;
  hidden?: boolean;
  heading?: number;
  headingMode?: HeadingInterpolation;
  constantHeading?: number;
  startHeading?: number;
  endHeading?: number;
  linearStartT?: number;
  linearEndT?: number;
  tangentReversed?: boolean;
  controlPoints?: ControlPoint[];
  controlsExpanded?: boolean;
  actionsExpanded?: boolean;
  poseName?: string;
  actionTriggers?: PathActionTrigger[];
};

export type AutonActionItem = {
  id: string;
  kind: "action";
  name: string;
  mode: AutonActionMode;
  timeout: number;
};

export type AutonPathItem = {
  id: string;
  kind: "path";
  pointId: string;
};

export type AutonSequenceItem = AutonActionItem | AutonPathItem;

export type PlannerSnapshot = {
  points: Point[];
  sequenceItems: AutonSequenceItem[];
};

export type PlannerHistoryState = {
  undoStack: PlannerSnapshot[];
  redoStack: PlannerSnapshot[];
};

export type PersistedPlannerDraft = PlannerSnapshot & Partial<PlannerHistoryState>;

export type MotionParameters = {
  maxAngularVelocity: number;
  maxForwardAcceleration: number;
  maxLateralAcceleration: number;
};

export type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "control"; pathIndex: number; controlIndex: number };

export type FieldSize = {
  width: number;
  height: number;
};
