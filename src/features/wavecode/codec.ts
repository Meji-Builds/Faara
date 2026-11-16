/**
 * Hum wave payload coding. The 10-character code (5 bits per character) gets a CRC-15 and
 * five Reed-Solomon parity symbols: 18 symbols over GF(32). Each symbol is drawn as two
 * bars of six possible heights (6 × 6 = 36 ≥ 32).
 */
import { CODE_LENGTH, codeToSymbols, symbolsToCode } from '@/features/sound/modem/alphabet';
import { crcSymbols } from '@/features/sound/modem/crc';
import { ReedSolomonError, rsDecode, rsEncode } from '@/features/sound/modem/reedSolomon';

import { BAR_COUNT, DATA_BARS, LEVELS, REFERENCE_BARS } from './layout';

const CRC_SYMBOLS = 3;
const PARITY_SYMBOLS = 5;
const SYMBOL_COUNT = CODE_LENGTH + CRC_SYMBOLS + PARITY_SYMBOLS;

/** Bar levels (0–5) for a hum code, including the full-height reference bars. */
export function encodeWave(token: string): number[] {
  const payload = codeToSymbols(token);
  const codeword = rsEncode([...payload, ...crcSymbols(payload, CRC_SYMBOLS)], PARITY_SYMBOLS);
  const bars = new Array<number>(BAR_COUNT).fill(LEVELS - 1);
  codeword.forEach((symbol, index) => {
    bars[DATA_BARS[index * 2] as number] = Math.floor(symbol / LEVELS);
    bars[DATA_BARS[index * 2 + 1] as number] = symbol % LEVELS;
  });
  return bars;
}

function decodeOrdered(levels: readonly number[], confidence: readonly number[]): string | null {
  if (REFERENCE_BARS.some((i) => levels[i] !== LEVELS - 1)) return null;
  const symbols: number[] = [];
  const quality: number[] = [];
  for (let s = 0; s < SYMBOL_COUNT; s++) {
    const a = DATA_BARS[s * 2] as number;
    const b = DATA_BARS[s * 2 + 1] as number;
    const value = (levels[a] as number) * LEVELS + (levels[b] as number);
    symbols.push(value < 32 ? value : 0);
    quality.push(value < 32 ? Math.min(confidence[a] as number, confidence[b] as number) : -1);
  }
  const weakest = quality
    .map((value, index) => ({ value, index }))
    .sort((x, y) => x.value - y.value)
    .map(({ index }) => index);

  for (let erasures = 0; erasures < PARITY_SYMBOLS; erasures += 2) {
    try {
      const { message } = rsDecode(symbols, PARITY_SYMBOLS, weakest.slice(0, erasures));
      const payload = message.slice(0, CODE_LENGTH);
      const expected = crcSymbols(payload, CRC_SYMBOLS);
      if (expected.every((symbol, i) => message[CODE_LENGTH + i] === symbol))
        return symbolsToCode(payload);
    } catch (error) {
      if (!(error instanceof ReedSolomonError)) throw error;
    }
  }
  return null;
}

/** Recovers the code from measured bar levels; also tries the mirrored order (upside-down scan). */
export function decodeWaveLevels(
  levels: readonly number[],
  confidence: readonly number[],
): string | null {
  if (levels.length !== BAR_COUNT) return null;
  return (
    decodeOrdered(levels, confidence) ??
    decodeOrdered([...levels].reverse(), [...confidence].reverse())
  );
}
