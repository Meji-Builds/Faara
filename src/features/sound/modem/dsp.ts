/** Small DSP building blocks used by the modem. */

/** Power of a single frequency over a block of samples (Goertzel algorithm). */
export function goertzelPower(
  samples: Float32Array,
  start: number,
  length: number,
  frequency: number,
  sampleRate: number,
): number {
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let s1 = 0;
  let s2 = 0;
  const end = start + length;
  for (let i = start; i < end; i++) {
    const s0 = (samples[i] as number) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (length * length);
}

/** Second-order IIR section (direct form I), RBJ cookbook coefficients. */
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  static highPass(cutoffHz: number, sampleRate: number, q: number): Biquad {
    const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(
      (1 + cos) / 2 / a0,
      -(1 + cos) / a0,
      (1 + cos) / 2 / a0,
      (-2 * cos) / a0,
      (1 - alpha) / a0,
    );
  }

  process(input: Float32Array, output: Float32Array = input): Float32Array {
    for (let i = 0; i < input.length; i++) {
      const x = input[i] as number;
      const y =
        this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      output[i] = y;
    }
    return output;
  }
}

/** 4th-order Butterworth high-pass built from two cascaded biquads. */
export class HighPassFilter {
  private readonly stages: Biquad[];

  constructor(cutoffHz: number, sampleRate: number) {
    this.stages = [
      Biquad.highPass(cutoffHz, sampleRate, 0.5411961),
      Biquad.highPass(cutoffHz, sampleRate, 1.306563),
    ];
  }

  process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);
    let current: Float32Array = input;
    for (const stage of this.stages) {
      stage.process(current, output);
      current = output;
    }
    return output;
  }
}

/** In-place iterative radix-2 complex FFT. */
export class FFT {
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(readonly size: number) {
    if (size < 2 || (size & (size - 1)) !== 0)
      throw new RangeError('FFT size must be a power of two');
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    const bits = Math.log2(size);
    this.reversed = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      this.reversed[i] = r;
    }
  }

  /** Forward transform. `inverse` computes the unscaled inverse; divide by size afterwards. */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reversed[i] as number;
      if (j > i) {
        [re[i], re[j]] = [re[j] as number, re[i] as number];
        [im[i], im[j]] = [im[j] as number, im[i] as number];
      }
    }
    const sign = inverse ? -1 : 1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step] as number;
          const wi = sign * (this.sin[k * step] as number);
          const a = i + k;
          const b = a + half;
          const xr = (re[b] as number) * wr - (im[b] as number) * wi;
          const xi = (re[b] as number) * wi + (im[b] as number) * wr;
          re[b] = (re[a] as number) - xr;
          im[b] = (im[a] as number) - xi;
          re[a] = (re[a] as number) + xr;
          im[a] = (im[a] as number) + xi;
        }
      }
    }
  }
}

export function nextPowerOfTwo(n: number): number {
  return 2 ** Math.ceil(Math.log2(n));
}
