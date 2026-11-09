export type ControlPoint = {
  id: string;
  nx: number;
  ny: number;
  poseName?: string;
  pathGeometry?: PathGeometry;
  startControlOffsetNx?: number;
  startControlOffsetNy?: number;
  endControlOffsetNx?: number;
  endControlOffsetNy?: number;
  /** Legacy symmetric node handle, read only while migrating saved drafts. */
  controlOffsetNx?: number;
  controlOffsetNy?: number;
};

export type HeadingInterpolation = "constant" | "linear" | "tangential";
export type PathGeometry = "linear" | "spline";
export type PathHeadingField = "constant" | "start" | "end" | "startT" | "endT";
export type AutonActionMode = "submit" | "run" | "remove";
export type AutonAlliance = "BLUE" | "RED";
export type PathActionTriggerMode = "submit" | "remove";

export type PathActionTrigger = {
  id: string;
  mode: PathActionTriggerMode;
  /** Full-path distance fraction in [0, 1]; keep the key for saved projects. */
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
  /** Geometry of the final segment; earlier segments live in controlPoints. */
  pathGeometry?: PathGeometry;
  segmentId?: string;
  startControlOffsetNx?: number;
  startControlOffsetNy?: number;
  endControlOffsetNx?: number;
  endControlOffsetNy?: number;
  /** Segments before the final segment. The legacy key is retained for saved-draft compatibility. */
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
  alliance: AutonAlliance;
};

export type PlannerHistoryState = {
  undoStack: PlannerSnapshot[];
  redoStack: PlannerSnapshot[];
};

export type PersistedPlannerDraft = PlannerSnapshot & Partial<PlannerHistoryState>;

export type SimulationParameters = {
  translationalAcceleration: number;
  angularAcceleration: number;
};

export type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "segmentEnd"; pathIndex: number; segmentIndex: number }
  | {
      kind: "segmentControl";
      pathIndex: number;
      segmentIndex: number;
      control: "start" | "end";
    };

export type FieldSize = {
  width: number;
  height: number;
};
