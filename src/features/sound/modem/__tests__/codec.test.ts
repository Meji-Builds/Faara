import { ALPHABET, codeToSymbols, isValidCode, randomCode, symbolsToCode } from '../alphabet';
import { crc, crcSymbols } from '../crc';
import { gfDiv, gfInverse, gfMul, gfPow } from '../gf32';
import { ReedSolomonError, rsDecode, rsEncode } from '../reedSolomon';
import { createRandom } from './channel';

describe('alphabet', () => {
  it('round-trips codes through symbols', () => {
    const code = '7XKQ9FQA2M';
    expect(symbolsToCode(codeToSymbols(code))).toBe(code);
  });

  it('accepts Crockford aliases and lowercase', () => {
    expect(codeToSymbols('oil0000000').slice(0, 3)).toEqual([0, 1, 1]);
  });

  it('rejects wrong lengths and characters', () => {
    expect(isValidCode('ABC')).toBe(false);
    expect(isValidCode('ABCDEFGHU1')).toBe(false);
    expect(() => codeToSymbols('U000000000')).toThrow();
  });

  it('generates codes from the alphabet', () => {
    const code = randomCode();
    expect(code).toHaveLength(10);
    for (const char of code) expect(ALPHABET).toContain(char);
  });
});

describe('GF(32)', () => {
  it('has a multiplicative inverse for every non-zero element', () => {
    for (let a = 1; a < 32; a++) expect(gfMul(a, gfInverse(a))).toBe(1);
  });

  it('generator 2 has order 31', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 31; i++) seen.add(gfPow(2, i));
    expect(seen.size).toBe(31);
    expect(gfPow(2, 31)).toBe(1);
  });

  it('division inverts multiplication', () => {
    for (let a = 0; a < 32; a++) for (let b = 1; b < 32; b++) expect(gfDiv(gfMul(a, b), b)).toBe(a);
  });
});

describe('CRC', () => {
  it.each([2, 3])('splits into %i symbols', (count) => {
    const symbols = codeToSymbols('HXM24A7K9Q');
    const parts = crcSymbols(symbols, count);
    expect(parts).toHaveLength(count);
    expect(parts.reduce((acc, part) => (acc << 5) | part, 0)).toBe(crc(symbols, count * 5));
  });

  it('detects every single-symbol change', () => {
    const symbols = codeToSymbols('HXM24A7K9Q');
    const reference = crc(symbols, 15);
    for (let i = 0; i < symbols.length; i++) {
      for (let v = 0; v < 32; v++) {
        if (v === symbols[i]) continue;
        const changed = [...symbols];
        changed[i] = v;
        expect(crc(changed, 15)).not.toBe(reference);
      }
    }
  });
});

describe('Reed-Solomon over GF(32)', () => {
  const PARITY = 6;
  const random = createRandom(42);
  const randomMessage = () => Array.from({ length: 13 }, () => Math.floor(random() * 32));

  /** Corrupts `count` distinct positions with a different value; returns the positions. */
  function corrupt(codeword: number[], count: number): number[] {
    const positions = new Set<number>();
    while (positions.size < count) positions.add(Math.floor(random() * codeword.length));
    for (const p of positions)
      codeword[p] = ((codeword[p] as number) + 1 + Math.floor(random() * 31)) % 32;
    return [...positions];
  }

  it('produces a codeword whose message part is unchanged', () => {
    const message = randomMessage();
    const codeword = rsEncode(message, PARITY);
    expect(codeword).toHaveLength(19);
    expect(codeword.slice(0, 13)).toEqual(message);
    expect(rsDecode(codeword, PARITY).message).toEqual(message);
  });

  it.each([1, 2, 3])('corrects %i random errors', (errors) => {
    for (let trial = 0; trial < 200; trial++) {
      const message = randomMessage();
      const codeword = rsEncode(message, PARITY);
      corrupt(codeword, errors);
      expect(rsDecode(codeword, PARITY).message).toEqual(message);
    }
  });

  it.each([2, 4, 6])('corrects %i erasures', (erasures) => {
    for (let trial = 0; trial < 200; trial++) {
      const message = randomMessage();
      const codeword = rsEncode(message, PARITY);
      const positions = corrupt(codeword, erasures);
      expect(rsDecode(codeword, PARITY, positions).message).toEqual(message);
    }
  });

  it('corrects a mix of errors and erasures within 2e + s ≤ parity', () => {
    for (let trial = 0; trial < 200; trial++) {
      const message = randomMessage();
      const codeword = rsEncode(message, PARITY);
      const positions = corrupt(codeword, 4);
      // Erase two of the four corrupted symbols; the other two are unknown errors.
      expect(rsDecode(codeword, PARITY, positions.slice(0, 2)).message).toEqual(message);
    }
  });

  it('never silently returns a wrong message for 4 errors without the CRC catching it', () => {
    let wrongAccepted = 0;
    for (let trial = 0; trial < 500; trial++) {
      const payload = Array.from({ length: 10 }, () => Math.floor(random() * 32));
      const message = [...payload, ...crcSymbols(payload, 3)];
      const codeword = rsEncode(message, PARITY);
      corrupt(codeword, 4);
      try {
        const decoded = rsDecode(codeword, PARITY).message;
        const expected = crcSymbols(decoded.slice(0, 10), 3);
        const crcMatches = expected.every((symbol, i) => decoded[10 + i] === symbol);
        if (crcMatches && decoded.join() !== message.join()) wrongAccepted++;
      } catch (error) {
        expect(error).toBeInstanceOf(ReedSolomonError);
      }
    }
    expect(wrongAccepted).toBe(0);
  });
});
