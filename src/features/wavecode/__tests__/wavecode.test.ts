import { randomCode } from '@/features/sound/modem/alphabet';
import { createRandom, gaussian } from '@/features/sound/modem/__tests__/channel';

import { decodeWaveLevels, encodeWave } from '../codec';
import {
  BAR_COUNT,
  BAR_INNER_RADIUS,
  BAR_MAX_LENGTH,
  BAR_THICKNESS,
  LEVELS,
  OUTER_RADIUS,
  REFERENCE_BARS,
  SLOT_COUNT,
  levelToRatio,
} from '../layout';
import { scanWave } from '../scan';

interface Scene {
  width: number;
  height: number;
  /** Disc radius in pixels. */
  radius: number;
  /** Rotation of the ring in degrees (it spins while shown). */
  rotation?: number;
  /** Luminance outside the card (dark or light app background). */
  surround?: number;
  noise?: number;
  blur?: number;
  /** Vertical squash from viewing at an angle (1 = face-on). */
  squash?: number;
  /** Angle of the brighter sweeping highlight, degrees. */
  highlight?: number;
  offset?: [number, number];
}

/** Renders the ring as a camera would see it: teal disc and bars on a deep-green card. */
function render(token: string, scene: Scene, seed = 1): Uint8Array {
  const { width, height, radius: R } = scene;
  const random = createRandom(seed);
  const bars = encodeWave(token);
  const lum = new Uint8Array(width * height).fill(scene.surround ?? 20);
  const cx = width / 2 + (scene.offset?.[0] ?? 0);
  const cy = height / 2 + (scene.offset?.[1] ?? 0);
  const squash = scene.squash ?? 1;
  const rotation = ((scene.rotation ?? 0) * Math.PI) / 180;
  const halfT = BAR_THICKNESS / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x - cx) / R;
      const v = (y - cy) / R / squash;
      const r = Math.hypot(u, v);
      if (r > OUTER_RADIUS) continue;
      let value = 44; // card
      if (r <= 1) {
        // Disc with the dark hum mark in the middle.
        const mark =
          Math.abs(v) < 0.3 && Math.abs(u) < 0.42 && Math.floor((u + 0.42) / 0.084) % 2 === 0;
        value = mark ? 20 : 159;
      } else if (r >= BAR_INNER_RADIUS - halfT) {
        const angle = (Math.atan2(v, u) - rotation + 4 * Math.PI) % (2 * Math.PI);
        const slot = Math.round((angle / (2 * Math.PI)) * SLOT_COUNT) % SLOT_COUNT;
        if (slot !== 0) {
          const centre = (slot * 2 * Math.PI) / SLOT_COUNT;
          const delta = angle - centre > Math.PI ? angle - centre - 2 * Math.PI : angle - centre;
          const along = r * Math.cos(delta);
          const across = Math.abs(r * Math.sin(delta));
          const length = levelToRatio(bars[slot - 1] as number) * BAR_MAX_LENGTH;
          const from = BAR_INNER_RADIUS + halfT;
          const to = BAR_INNER_RADIUS + length - halfT;
          const inBody = across <= halfT && along >= from && along <= to;
          const inCap =
            Math.hypot(across, along - from) <= halfT || Math.hypot(across, along - to) <= halfT;
          if (inBody || inCap) {
            const lit =
              scene.highlight !== undefined &&
              (((angle + rotation) * 180) / Math.PI - scene.highlight + 720) % 360 < 90;
            value = lit ? 217 : 159;
          }
        }
      }
      lum[y * width + x] = value;
    }
  }

  const out = new Uint8Array(lum);
  if (scene.blur) {
    const b = scene.blur;
    for (let y = b; y < height - b; y++) {
      for (let x = b; x < width - b; x++) {
        let sum = 0;
        for (let j = -b; j <= b; j++)
          for (let i = -b; i <= b; i++) sum += lum[(y + j) * width + x + i] as number;
        out[y * width + x] = sum / (2 * b + 1) ** 2;
      }
    }
  }
  if (scene.noise) {
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(0, Math.min(255, (out[i] as number) + gaussian(random) * scene.noise));
    }
  }
  return out;
}

describe('hum wave codec', () => {
  it('round-trips codes through bar levels', () => {
    for (let i = 0; i < 100; i++) {
      const code = randomCode();
      const bars = encodeWave(code);
      expect(bars).toHaveLength(BAR_COUNT);
      bars.forEach((level) => expect(level).toBeLessThan(LEVELS));
      expect(
        decodeWaveLevels(
          bars,
          bars.map(() => 0.5),
        ),
      ).toBe(code);
      expect(
        decodeWaveLevels(
          [...bars].reverse(),
          bars.map(() => 0.5),
        ),
      ).toBe(code);
    }
  });

  it('corrects misread bars and rejects garbage', () => {
    const code = randomCode();
    const bars = encodeWave(code);
    const damaged = [...bars];
    damaged[3] = ((damaged[3] as number) + 1) % LEVELS;
    damaged[21] = ((damaged[21] as number) + 2) % LEVELS;
    expect(
      decodeWaveLevels(
        damaged,
        bars.map(() => 0.5),
      ),
    ).toBe(code);
    const random = createRandom(4);
    let accepted = 0;
    for (let i = 0; i < 50000; i++) {
      const junk = bars.map((_, j) =>
        REFERENCE_BARS.includes(j) ? 5 : Math.floor(random() * LEVELS),
      );
      if (
        decodeWaveLevels(
          junk,
          junk.map(() => 0.5),
        )
      )
        accepted++;
    }
    expect(accepted).toBe(0);
  });
});

describe('hum ring scanner', () => {
  const scenes: [string, Scene][] = [
    ['a clean, close frame', { width: 480, height: 480, radius: 60 }],
    ['a small ring far away', { width: 480, height: 640, radius: 26, offset: [40, -90] }],
    ['a light app background', { width: 480, height: 480, radius: 50, surround: 240 }],
    ['camera noise and blur', { width: 480, height: 480, radius: 50, noise: 10, blur: 1 }],
    ['every rotation while spinning', { width: 480, height: 480, radius: 48 }],
    [
      'the sweeping highlight',
      { width: 480, height: 480, radius: 50, highlight: 130, rotation: 33 },
    ],
    [
      'a tilted phone (15% squash)',
      { width: 480, height: 480, radius: 55, squash: 0.85, rotation: 71 },
    ],
    [
      'squash with noise, off-centre',
      {
        width: 480,
        height: 640,
        radius: 40,
        squash: 0.9,
        noise: 6,
        offset: [-50, 60],
        rotation: 200,
      },
    ],
  ];

  it.each(scenes)('reads %s', (name, scene) => {
    for (let i = 0; i < 8; i++) {
      const code = randomCode();
      const rotation = name.startsWith('every rotation')
        ? i * 47.3
        : (scene.rotation ?? 0) + i * 13;
      expect(scanWave(render(code, { ...scene, rotation }, i + 1), scene.width, scene.height)).toBe(
        code,
      );
    }
  });

  it('finds nothing in noise or a blank frame', () => {
    const random = createRandom(9);
    const noise = Uint8Array.from({ length: 320 * 240 }, () => Math.floor(random() * 256));
    expect(scanWave(noise, 320, 240)).toBeNull();
    expect(scanWave(new Uint8Array(320 * 240).fill(128), 320, 240)).toBeNull();
  });
});
