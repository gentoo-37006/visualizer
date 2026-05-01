export type ControlPoint = {
  id: string;
  nx: number;
  ny: number;
  poseName?: string;
};

export type HeadingInterpolation = "constant" | "linear" | "tangential";
export type PathHeadingField = "constant" | "start" | "end";
export type AutonActionMode = "start" | "run" | "stop";

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
  controlPoints?: ControlPoint[];
  controlsExpanded?: boolean;
  poseName?: string;
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

export type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "control"; pathIndex: number; controlIndex: number };

export type FieldSize = {
  width: number;
  height: number;
};
