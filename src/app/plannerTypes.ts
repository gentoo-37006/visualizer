export type ControlPoint = {
  id: string;
  nx: number;
  ny: number;
  poseName?: string;
};

export type HeadingInterpolation = "constant" | "linear" | "tangential";
export type PathHeadingField = "constant" | "start" | "end";

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

export type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "control"; pathIndex: number; controlIndex: number };

export type FieldSize = {
  width: number;
  height: number;
};
