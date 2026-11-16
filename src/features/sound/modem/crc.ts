/**
 * CRC over 5-bit symbols, appended to the payload so Reed-Solomon miscorrections
 * are rejected. The width is 5 bits per CRC symbol (10 or 15 bits).
 */
const POLYNOMIALS: Record<number, number> = {
  10: 0x233, // CRC-10: x^10 + x^9 + x^5 + x^4 + x + 1
  15: 0x4599, // CRC-15/CAN: x^15 + x^14 + x^10 + x^8 + x^7 + x^4 + x^3 + 1
};

export function crc(symbols: readonly number[], width: number): number {
  const poly = POLYNOMIALS[width];
  if (poly === undefined) throw new RangeError(`Unsupported CRC width: ${width}`);
  const top = 1 << width;
  let reg = 0;
  const shiftIn = (bit: number) => {
    reg = (reg << 1) | bit;
    if (reg & top) reg ^= poly;
  };
  for (const symbol of symbols) for (let bit = 4; bit >= 0; bit--) shiftIn((symbol >> bit) & 1);
  // Flush with `width` zero bits so the remainder covers the whole message.
  for (let i = 0; i < width; i++) shiftIn(0);
  return reg & (top - 1);
}

/** CRC as `count` 5-bit symbols, most significant first. */
export function crcSymbols(symbols: readonly number[], count: number): number[] {
  const value = crc(symbols, count * 5);
  return Array.from({ length: count }, (_, i) => (value >> (5 * (count - 1 - i))) & 31);
}
