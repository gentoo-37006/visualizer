import { seededColor } from "./plannerColors";

export const FIELD_SIZE_INCHES = 144;
export const DEFAULT_SEGMENT_LENGTH_INCHES = 24;
export const POINT_DIAMETER = 20;
export const CONTROL_POINT_DIAMETER = POINT_DIAMETER;
export const POINT_RADIUS = POINT_DIAMETER / 2;
export const CONTROL_POINT_RADIUS = CONTROL_POINT_DIAMETER / 2;
export const FIELD_BORDER_WIDTH = 3;
export const INITIAL_POINT_ID = "init-point";
export const INITIAL_POINT_COLOR = seededColor(INITIAL_POINT_ID);
