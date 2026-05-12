export const FIELD_IMAGE_STORAGE_KEY = "auton-path-planner:field-image";

export const FIELD_IMAGE_PRESETS = [
  { id: "decode", name: "Decode", src: "/fields/decode.webp" },
  { id: "intothedeep", name: "Into The Deep", src: "/fields/intothedeep.webp" },
  { id: "centerstage", name: "Centerstage", src: "/fields/centerstage.webp" },
] as const;

export const DEFAULT_FIELD_IMAGE = FIELD_IMAGE_PRESETS[0];
