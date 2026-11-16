/**
 * Arithmetic in GF(2^5) with primitive polynomial x^5 + x^2 + 1 and generator α = 2.
 * Elements are integers 0–31; addition is XOR.
 */
export const FIELD_SIZE = 32;
const ORDER = FIELD_SIZE - 1; // multiplicative group order
const PRIMITIVE_POLY = 0b100101;

const EXP = new Uint8Array(ORDER * 2);
const LOG = new Uint8Array(FIELD_SIZE);

(() => {
  let x = 1;
  for (let i = 0; i < ORDER; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & FIELD_SIZE) x ^= PRIMITIVE_POLY;
  }
  // Duplicate the table so products of logs never need a modulo.
  for (let i = ORDER; i < ORDER * 2; i++) EXP[i] = EXP[i - ORDER] as number;
})();

const mod = (n: number) => ((n % ORDER) + ORDER) % ORDER;

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] as number) + (LOG[b] as number)] as number;
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('Division by zero in GF(32)');
  if (a === 0) return 0;
  return EXP[mod((LOG[a] as number) - (LOG[b] as number))] as number;
}

export function gfPow(a: number, power: number): number {
  if (a === 0) return power === 0 ? 1 : 0;
  return EXP[mod((LOG[a] as number) * power)] as number;
}

export function gfInverse(a: number): number {
  return gfDiv(1, a);
}

/* Polynomials are arrays of coefficients, highest degree first. */

export function polyScale(p: readonly number[], x: number): number[] {
  return p.map((c) => gfMul(c, x));
}

export function polyAdd(p: readonly number[], q: readonly number[]): number[] {
  const length = Math.max(p.length, q.length);
  const result = new Array<number>(length).fill(0);
  p.forEach((c, i) => (result[i + length - p.length] = c));
  q.forEach(
    (c, i) => (result[i + length - q.length] = (result[i + length - q.length] as number) ^ c),
  );
  return result;
}

export function polyMul(p: readonly number[], q: readonly number[]): number[] {
  const result = new Array<number>(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      result[i + j] = (result[i + j] as number) ^ gfMul(p[i] as number, q[j] as number);
    }
  }
  return result;
}

export function polyEval(p: readonly number[], x: number): number {
  let y = p[0] ?? 0;
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ (p[i] as number);
  return y;
}

/** Synthetic division by a monic divisor. Returns [quotient, remainder]. */
export function polyDiv(
  dividend: readonly number[],
  divisor: readonly number[],
): [number[], number[]] {
  const out = [...dividend];
  for (let i = 0; i <= dividend.length - divisor.length; i++) {
    const coef = out[i] as number;
    if (coef === 0) continue;
    for (let j = 1; j < divisor.length; j++) {
      const d = divisor[j] as number;
      if (d !== 0) out[i + j] = (out[i + j] as number) ^ gfMul(d, coef);
    }
  }
  const separator = out.length - (divisor.length - 1);
  return [out.slice(0, separator), out.slice(separator)];
}
