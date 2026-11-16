import {
  FIELD_SIZE,
  gfDiv,
  gfInverse,
  gfMul,
  gfPow,
  polyAdd,
  polyDiv,
  polyEval,
  polyMul,
  polyScale,
} from './gf32';

/**
 * Reed-Solomon code over GF(32) (first consecutive root α^0).
 * With `paritySymbols` = p it corrects any combination of e errors and s erasures
 * where 2e + s ≤ p. Codeword length must be ≤ 31.
 */

export class ReedSolomonError extends Error {}

const generatorCache = new Map<number, number[]>();

function generatorPoly(paritySymbols: number): number[] {
  let g = generatorCache.get(paritySymbols);
  if (!g) {
    g = [1];
    for (let i = 0; i < paritySymbols; i++) g = polyMul(g, [1, gfPow(2, i)]);
    generatorCache.set(paritySymbols, g);
  }
  return g;
}

/** Returns the message followed by `paritySymbols` parity symbols. */
export function rsEncode(message: readonly number[], paritySymbols: number): number[] {
  if (message.length + paritySymbols >= FIELD_SIZE) {
    throw new RangeError(`Codeword too long for GF(32): ${message.length + paritySymbols}`);
  }
  const gen = generatorPoly(paritySymbols);
  const out = [...message, ...new Array<number>(paritySymbols).fill(0)];
  for (let i = 0; i < message.length; i++) {
    const coef = out[i] as number;
    if (coef === 0) continue;
    for (let j = 1; j < gen.length; j++)
      out[i + j] = (out[i + j] as number) ^ gfMul(gen[j] as number, coef);
  }
  return [...message, ...out.slice(message.length)];
}

function syndromes(codeword: readonly number[], paritySymbols: number): number[] {
  const synd = [0];
  for (let i = 0; i < paritySymbols; i++) synd.push(polyEval(codeword, gfPow(2, i)));
  return synd;
}

function errataLocator(coefPositions: readonly number[]): number[] {
  let loc = [1];
  for (const pos of coefPositions) loc = polyMul(loc, polyAdd([1], [gfPow(2, pos), 0]));
  return loc;
}

function errorEvaluator(
  synd: readonly number[],
  errLoc: readonly number[],
  paritySymbols: number,
): number[] {
  const divisor = [1, ...new Array<number>(paritySymbols + 1).fill(0)];
  return polyDiv(polyMul(synd, errLoc), divisor)[1];
}

/** Forney algorithm: computes and applies error magnitudes at known positions. */
function correctErrata(
  codeword: readonly number[],
  synd: readonly number[],
  positions: readonly number[],
): number[] {
  const n = codeword.length;
  const coefPositions = positions.map((p) => n - 1 - p);
  const errLoc = errataLocator(coefPositions);
  const errEval = errorEvaluator([...synd].reverse(), errLoc, errLoc.length - 1).reverse();
  const X = coefPositions.map((pos) => gfPow(2, pos));

  const magnitudes = new Array<number>(n).fill(0);
  X.forEach((Xi, i) => {
    const XiInv = gfInverse(Xi);
    let locPrime = 1;
    X.forEach((Xj, j) => {
      if (j !== i) locPrime = gfMul(locPrime, 1 ^ gfMul(XiInv, Xj));
    });
    if (locPrime === 0) throw new ReedSolomonError('Forney: zero denominator');
    const y = gfMul(Xi, polyEval([...errEval].reverse(), XiInv));
    magnitudes[positions[i] as number] = gfDiv(y, locPrime);
  });
  return polyAdd(codeword, magnitudes);
}

/** Berlekamp-Massey on Forney syndromes. */
function errorLocator(
  synd: readonly number[],
  paritySymbols: number,
  erasureCount: number,
): number[] {
  let errLoc = [1];
  let oldLoc = [1];
  const shift = synd.length > paritySymbols ? synd.length - paritySymbols : 0;

  for (let i = 0; i < paritySymbols - erasureCount; i++) {
    const K = i + shift;
    let delta = synd[K] as number;
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j] as number, synd[K - j] as number);
    }
    oldLoc = [...oldLoc, 0];
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInverse(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length > 0 && errLoc[0] === 0) errLoc.shift();
  const errors = errLoc.length - 1;
  if ((errors - erasureCount) * 2 + erasureCount > paritySymbols) {
    throw new ReedSolomonError('Too many errors to correct');
  }
  return errLoc;
}

/** Chien search: positions (index into the codeword) where the locator has roots. */
function findErrors(errLoc: readonly number[], n: number): number[] {
  const expected = errLoc.length - 1;
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    if (polyEval(errLoc, gfPow(2, i)) === 0) positions.push(n - 1 - i);
  }
  if (positions.length !== expected) throw new ReedSolomonError('Chien search failed');
  return positions;
}

function forneySyndromes(
  synd: readonly number[],
  erasures: readonly number[],
  n: number,
): number[] {
  const fsynd = synd.slice(1);
  for (const pos of erasures) {
    const x = gfPow(2, n - 1 - pos);
    for (let j = 0; j < fsynd.length - 1; j++) {
      fsynd[j] = gfMul(fsynd[j] as number, x) ^ (fsynd[j + 1] as number);
    }
  }
  return fsynd;
}

export interface RsDecodeResult {
  message: number[];
  /** Number of symbols that were changed. */
  corrected: number;
}

/**
 * Decodes a codeword, correcting errors and the given erasure positions.
 * Throws ReedSolomonError if the codeword cannot be corrected.
 */
export function rsDecode(
  codeword: readonly number[],
  paritySymbols: number,
  erasures: readonly number[] = [],
): RsDecodeResult {
  if (erasures.length > paritySymbols) throw new ReedSolomonError('Too many erasures');
  const n = codeword.length;
  let out = [...codeword];
  for (const pos of erasures) out[pos] = 0;

  let synd = syndromes(out, paritySymbols);
  if (synd.every((s) => s === 0)) {
    return { message: out.slice(0, n - paritySymbols), corrected: countDiff(codeword, out) };
  }

  const fsynd = forneySyndromes(synd, erasures, n);
  const errLoc = errorLocator(fsynd, paritySymbols, erasures.length);
  const errPositions = findErrors([...errLoc].reverse(), n);
  out = correctErrata(out, synd, [...erasures, ...errPositions]);

  synd = syndromes(out, paritySymbols);
  if (synd.some((s) => s !== 0)) throw new ReedSolomonError('Could not correct codeword');
  return { message: out.slice(0, n - paritySymbols), corrected: countDiff(codeword, out) };
}

function countDiff(a: readonly number[], b: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}
