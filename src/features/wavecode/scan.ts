/**
 * Reads a hum ring from a greyscale camera frame, at any rotation.
 *
 * 1. Split bright from dark and label connected bright regions; the central disc is a
 *    large, round, mostly solid one.
 * 2. Use the disc's shape (second moments) to undo perspective squash, so distances can be
 *    measured in disc radii.
 * 3. Sweep 720 rays outward from the disc and measure the bar each one hits.
 * 4. Find the 40 angular slots, locate the empty start slot, and read the 39 bar lengths
 *    relative to the full-length reference bars.
 */
import { decodeWaveLevels } from './codec';
import {
  BAR_COUNT,
  BAR_INNER_RADIUS,
  BAR_MAX_LENGTH,
  MIN_RATIO,
  REFERENCE_BARS,
  SLOT_COUNT,
  ratioToLevel,
} from './layout';

type Pixels = Uint8Array | Uint8ClampedArray;

interface Disc {
  cx: number;
  cy: number;
  /** Maps (x, y) in disc radii to pixel offsets from the centre. */
  a: number;
  b: number;
  d: number;
  area: number;
}

const RAYS = 720;
const SAMPLES_PER_SLOT = RAYS / SLOT_COUNT;
const RADIAL_STEP = 0.02;
const MAX_DISC_CANDIDATES = 4;

function otsuThreshold(lum: Pixels): number | null {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++)
    histogram[lum[i] as number] = (histogram[lum[i] as number] as number) + 1;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (histogram[i] as number);
  let sumBelow = 0;
  let countBelow = 0;
  let best = 0;
  let threshold = -1;
  for (let t = 0; t < 256; t++) {
    countBelow += histogram[t] as number;
    if (countBelow === 0) continue;
    const countAbove = lum.length - countBelow;
    if (countAbove === 0) break;
    sumBelow += t * (histogram[t] as number);
    const diff = sumBelow / countBelow - (sum - sumBelow) / countAbove;
    const variance = countBelow * countAbove * diff * diff;
    if (variance > best) {
      best = variance;
      threshold = t;
    }
  }
  return threshold < 0 ? null : threshold;
}

/** Finds round, solid bright regions that could be the central disc, largest first. */
function findDiscs(lum: Pixels, width: number, height: number, threshold: number): Disc[] {
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const discs: Disc[] = [];
  const minArea = Math.max(60, (width * height) / 4000);

  for (let start = 0; start < lum.length; start++) {
    if (visited[start] || (lum[start] as number) <= threshold) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    let area = 0;
    let sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;
    while (top > 0) {
      const p = stack[--top] as number;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !visited[p - 1] && (lum[p - 1] as number) > threshold) {
        visited[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x < width - 1 && !visited[p + 1] && (lum[p + 1] as number) > threshold) {
        visited[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && !visited[p - width] && (lum[p - width] as number) > threshold) {
        visited[p - width] = 1;
        stack[top++] = p - width;
      }
      if (y < height - 1 && !visited[p + width] && (lum[p + width] as number) > threshold) {
        visited[p + width] = 1;
        stack[top++] = p + width;
      }
    }
    if (area < minArea) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const aspect = bw / bh;
    const fill = area / ((Math.PI / 4) * bw * bh);
    if (aspect < 0.6 || aspect > 1.67 || fill < 0.7 || fill > 1.08) continue;

    const cx = sx / area;
    const cy = sy / area;
    const vxx = sxx / area - cx * cx;
    const vyy = syy / area - cy * cy;
    const vxy = sxy / area - cx * cy;
    // A uniform disc of radius R has covariance (R²/4)·I, so the map from disc radii to
    // pixels is 2·sqrt(covariance). Symmetric 2×2 square root:
    const det = Math.sqrt(Math.max(vxx * vyy - vxy * vxy, 0));
    const scale = Math.sqrt(vxx + vyy + 2 * det);
    if (!(scale > 0)) continue;
    discs.push({
      cx,
      cy,
      a: (2 * (vxx + det)) / scale,
      b: (2 * vxy) / scale,
      d: (2 * (vyy + det)) / scale,
      area,
    });
  }
  return discs.sort((p, q) => q.area - p.area).slice(0, MAX_DISC_CANDIDATES);
}

function readRing(
  lum: Pixels,
  width: number,
  height: number,
  threshold: number,
  disc: Disc,
): string | null {
  const bright = (u: number, v: number): boolean | null => {
    const x = Math.round(disc.cx + disc.a * u + disc.b * v);
    const y = Math.round(disc.cy + disc.b * u + disc.d * v);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return (lum[y * width + x] as number) > threshold;
  };

  // Length of the bar each ray hits (0 when the ray passes between bars).
  const lengths = new Float32Array(RAYS);
  const maxRadius = BAR_INNER_RADIUS + BAR_MAX_LENGTH + 0.5;
  for (let k = 0; k < RAYS; k++) {
    const angle = (k * 2 * Math.PI) / RAYS;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let startRadius = -1;
    let endRadius = -1;
    for (let r = 1.15; r <= maxRadius; r += RADIAL_STEP) {
      const value = bright(r * cos, r * sin);
      if (value === null) break;
      if (value) {
        if (startRadius < 0) {
          if (r > BAR_INNER_RADIUS + 0.4) break; // too far out to be a bar's inner end
          startRadius = r;
        }
        endRadius = r;
      } else if (startRadius >= 0) {
        break;
      }
    }
    lengths[k] = startRadius >= 0 ? endRadius - startRadius + RADIAL_STEP : 0;
  }

  // Phase of the slot grid: circular mean of where bars are present within a slot.
  const present = MIN_RATIO * BAR_MAX_LENGTH * 0.4;
  let sumCos = 0;
  let sumSin = 0;
  for (let k = 0; k < RAYS; k++) {
    if ((lengths[k] as number) < present) continue;
    const phase = ((k % SAMPLES_PER_SLOT) / SAMPLES_PER_SLOT) * 2 * Math.PI;
    sumCos += Math.cos(phase);
    sumSin += Math.sin(phase);
  }
  if (sumCos === 0 && sumSin === 0) return null;
  const offset =
    ((Math.atan2(sumSin, sumCos) / (2 * Math.PI)) * SAMPLES_PER_SLOT + SAMPLES_PER_SLOT) %
    SAMPLES_PER_SLOT;

  // Longest reading near each slot centre.
  const reach = Math.floor(SAMPLES_PER_SLOT * 0.22);
  const slots: number[] = [];
  for (let j = 0; j < SLOT_COUNT; j++) {
    const centre = Math.round(offset + j * SAMPLES_PER_SLOT);
    let longest = 0;
    for (let i = -reach; i <= reach; i++) {
      longest = Math.max(longest, lengths[(centre + i + RAYS) % RAYS] as number);
    }
    slots.push(longest);
  }

  // Exactly one slot is empty: the start marker.
  const empty = slots.map((length, j) => (length < present ? j : -1)).filter((j) => j >= 0);
  if (empty.length !== 1) return null;
  const startSlot = empty[0] as number;
  const bars = Array.from(
    { length: BAR_COUNT },
    (_, i) => slots[(startSlot + 1 + i) % SLOT_COUNT] as number,
  );

  // Full length at each bar, interpolated between the reference bars.
  const [r0, r1, r2] = REFERENCE_BARS as [number, number, number];
  const reference = (i: number): number => {
    const [from, to] = i <= r1 ? [r0, r1] : [r1, r2];
    const t = (i - from) / (to - from);
    return (bars[from] as number) * (1 - t) + (bars[to] as number) * t;
  };
  // Reference bars must be plausibly full length for this disc.
  if ((bars[r0] as number) < BAR_MAX_LENGTH * 0.6 || (bars[r0] as number) > BAR_MAX_LENGTH * 1.5)
    return null;

  const levels: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const { level, confidence: c } = ratioToLevel((bars[i] as number) / reference(i));
    levels.push(level);
    confidence.push(c);
  }
  return decodeWaveLevels(levels, confidence);
}

/** Decodes a hum ring from 8-bit luminance pixels (row-major). Returns the code or null. */
export function scanWave(lum: Pixels, width: number, height: number): string | null {
  const threshold = otsuThreshold(lum);
  if (threshold === null) return null;
  for (const disc of findDiscs(lum, width, height, threshold)) {
    const code = readRing(lum, width, height, threshold, disc);
    if (code) return code;
  }
  return null;
}

/** Converts RGBA pixels to luminance. */
export function rgbaToLuminance(rgba: Pixels, pixelCount: number): Uint8Array {
  const lum = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    lum[i] =
      ((rgba[p] as number) * 77 + (rgba[p + 1] as number) * 150 + (rgba[p + 2] as number) * 29) >>
      8;
  }
  return lum;
}
