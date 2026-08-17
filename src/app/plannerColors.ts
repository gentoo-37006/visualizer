const hashSeed = (seed: string) => {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

/** Returns the same bright, field-visible color for a given seed. */
export const seededColor = (seed: string) => {
  const hash = hashSeed(seed);
  const hue = hash % 360;
  const saturation = 62 + ((hash >>> 9) % 15);
  const lightness = 58 + ((hash >>> 17) % 12);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
};
