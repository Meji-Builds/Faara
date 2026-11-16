/**
 * Geometry of the hum ring: bars radiating from a central disc, like a circular sound wave.
 * All lengths are in units of the disc radius.
 *
 * There are 40 angular slots. Slot 0 is left empty and marks where the code starts, so the
 * ring can be read at any rotation. The 39 bars that follow each have one of six lengths;
 * the first, middle and last are always full length and act as measuring references.
 */
export const BAR_COUNT = 39;
export const SLOT_COUNT = BAR_COUNT + 1;
export const REFERENCE_BARS: readonly number[] = [0, 19, 38];
export const LEVELS = 6;
/** Length of the shortest bar as a fraction of the longest. */
export const MIN_RATIO = 0.25;

/** Radius where bars begin. */
export const BAR_INNER_RADIUS = 1.4;
/** Length of a full bar. */
export const BAR_MAX_LENGTH = 1.5;
/** Bar thickness. */
export const BAR_THICKNESS = 0.12;
/** Radius of the whole symbol including a quiet margin. */
export const OUTER_RADIUS = 3.2;

const STEP = (1 - MIN_RATIO) / (LEVELS - 1);

export function levelToRatio(level: number): number {
  return MIN_RATIO + level * STEP;
}

/** Nearest level for a measured length ratio, with a confidence in [0, 0.5]. */
export function ratioToLevel(ratio: number): { level: number; confidence: number } {
  const exact = (ratio - MIN_RATIO) / STEP;
  const level = Math.min(LEVELS - 1, Math.max(0, Math.round(exact)));
  return { level, confidence: 0.5 - Math.min(0.5, Math.abs(exact - level)) };
}

/** Angle (radians, clockwise on screen from the start gap) of bar `index`. */
export function barAngle(index: number): number {
  return ((index + 1) * 2 * Math.PI) / SLOT_COUNT;
}

export const DATA_BARS: readonly number[] = Array.from({ length: BAR_COUNT }, (_, i) => i).filter(
  (i) => !REFERENCE_BARS.includes(i),
);
