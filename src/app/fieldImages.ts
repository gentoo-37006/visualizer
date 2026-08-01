export const FIELD_IMAGE_STORAGE_KEY = "auton-path-planner:field-image";
export const CUSTOM_FIELD_IMAGE_STORAGE_KEY = "auton-path-planner:custom-field-image";

export const FIELD_IMAGE_PRESETS = [
  { id: "decode", name: "Decode", src: "/fields/decode.webp" },
  { id: "intothedeep", name: "Into The Deep", src: "/fields/intothedeep.webp" },
  { id: "centerstage", name: "Centerstage", src: "/fields/centerstage.webp" },
] as const;

export const DEFAULT_FIELD_IMAGE = FIELD_IMAGE_PRESETS[0];

export const CUSTOM_FIELD_PRESET_ID = "custom";

export type FieldImageSelection =
  | { kind: "preset"; id: string }
  | { kind: "custom" };

export type CustomFieldImage = {
  name: string;
  dataUrl: string;
};

export const DEFAULT_FIELD_IMAGE_SELECTION: FieldImageSelection = {
  kind: "preset",
  id: DEFAULT_FIELD_IMAGE.id,
};

/**
 * The field renders at most ~1000 CSS pixels wide, so anything larger is wasted
 * detail that has to survive a round trip through localStorage on every load.
 */
const MAX_FIELD_IMAGE_DIMENSION = 1600;

/**
 * localStorage gives an origin roughly 5MB total, shared with poses and settings.
 * Keeping one field image under ~2MB of data URL leaves plenty of headroom.
 */
const MAX_STORED_FIELD_IMAGE_LENGTH = 2_000_000;

/** Progressively harder downscales, tried in order until one fits the budget. */
const ENCODE_ATTEMPTS = [
  { maxDimension: MAX_FIELD_IMAGE_DIMENSION, quality: 0.92 },
  { maxDimension: MAX_FIELD_IMAGE_DIMENSION, quality: 0.8 },
  { maxDimension: 1200, quality: 0.75 },
  { maxDimension: 900, quality: 0.7 },
  { maxDimension: 700, quality: 0.6 },
] as const;

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () =>
      reject(new Error("That file could not be read as an image."))
    );
    image.src = src;
  });

const drawScaled = (image: HTMLImageElement, maxDimension: number) => {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not process the image.");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
};

/**
 * Reads an uploaded file into a downscaled data URL small enough to persist.
 * The source aspect ratio is preserved; the field itself is square and stretches
 * the image to fit, exactly as it does for the built-in presets.
 */
export const createCustomFieldImage = async (file: File): Promise<CustomFieldImage> => {
  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImageElement(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("That image has no usable dimensions.");
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "Custom";

  for (const { maxDimension, quality } of ENCODE_ATTEMPTS) {
    const { canvas, context } = drawScaled(image, maxDimension);

    let dataUrl = canvas.toDataURL("image/webp", quality);
    if (!dataUrl.startsWith("data:image/webp")) {
      // Browsers that cannot encode WebP silently hand back PNG, which blows the
      // budget. Re-encode as JPEG over an opaque backdrop so alpha does not
      // turn black.
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#111827";
      context.fillRect(0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    if (dataUrl.length <= MAX_STORED_FIELD_IMAGE_LENGTH) return { name, dataUrl };
  }

  throw new Error("That image is too large to save. Try a smaller or simpler image.");
};

const isCustomFieldImage = (value: unknown): value is CustomFieldImage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CustomFieldImage).name === "string" &&
  typeof (value as CustomFieldImage).dataUrl === "string" &&
  (value as CustomFieldImage).dataUrl.startsWith("data:image/");

export const loadCustomFieldImage = (): CustomFieldImage | null => {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(CUSTOM_FIELD_IMAGE_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    return isCustomFieldImage(parsed) ? parsed : null;
  } catch {
    window.localStorage.removeItem(CUSTOM_FIELD_IMAGE_STORAGE_KEY);
    return null;
  }
};

export const saveCustomFieldImage = (image: CustomFieldImage) => {
  try {
    window.localStorage.setItem(CUSTOM_FIELD_IMAGE_STORAGE_KEY, JSON.stringify(image));
  } catch {
    throw new Error("There was not enough browser storage left to save that image.");
  }
};

export const clearCustomFieldImage = () => {
  window.localStorage.removeItem(CUSTOM_FIELD_IMAGE_STORAGE_KEY);
};

const isFieldImageSelection = (value: unknown): value is FieldImageSelection => {
  if (typeof value !== "object" || value === null) return false;
  const selection = value as FieldImageSelection;
  if (selection.kind === "custom") return true;
  return selection.kind === "preset" && typeof selection.id === "string";
};

export const loadFieldImageSelection = (): FieldImageSelection => {
  if (typeof window === "undefined") return DEFAULT_FIELD_IMAGE_SELECTION;

  const stored = window.localStorage.getItem(FIELD_IMAGE_STORAGE_KEY);
  if (!stored) return DEFAULT_FIELD_IMAGE_SELECTION;

  try {
    const parsed: unknown = JSON.parse(stored);
    return isFieldImageSelection(parsed) ? parsed : DEFAULT_FIELD_IMAGE_SELECTION;
  } catch {
    // Older builds stored a bare preset id.
    return { kind: "preset", id: stored };
  }
};

export const saveFieldImageSelection = (selection: FieldImageSelection) => {
  window.localStorage.setItem(FIELD_IMAGE_STORAGE_KEY, JSON.stringify(selection));
};

export const resolveFieldImageSrc = (
  selection: FieldImageSelection,
  customFieldImage: CustomFieldImage | null
) => {
  if (selection.kind === "custom") {
    return customFieldImage?.dataUrl ?? DEFAULT_FIELD_IMAGE.src;
  }
  const preset = FIELD_IMAGE_PRESETS.find((field) => field.id === selection.id);
  return (preset ?? DEFAULT_FIELD_IMAGE).src;
};
