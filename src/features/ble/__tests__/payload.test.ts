import { randomCode } from '@/features/sound/modem/alphabet';

import { estimateDistanceFromRssi, packToken, PAYLOAD_LENGTH, unpackToken } from '../payload';

describe('Bluetooth payload', () => {
  it('round-trips hum codes', () => {
    for (let i = 0; i < 200; i++) {
      const code = randomCode();
      const packed = packToken(code);
      expect(packed).toHaveLength(PAYLOAD_LENGTH);
      expect(unpackToken(packed)).toBe(code);
    }
    expect(unpackToken(packToken('ZZZZZZZZZZ'))).toBe('ZZZZZZZZZZ');
    expect(unpackToken(packToken('0000000000'))).toBe('0000000000');
  });

  it('rejects other versions, lengths and overflowing values', () => {
    const packed = packToken('K72GEKVHAA');
    expect(unpackToken(Uint8Array.from([2, ...packed.slice(1)]))).toBeNull();
    expect(unpackToken(packed.slice(0, 7))).toBeNull();
    expect(unpackToken(Uint8Array.from([1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))).toBeNull();
  });

  it('estimates nearer distances for stronger signals', () => {
    expect(estimateDistanceFromRssi(-60)).toBeLessThan(estimateDistanceFromRssi(-75));
    expect(estimateDistanceFromRssi(-75)).toBe(100);
    expect(estimateDistanceFromRssi(-20)).toBe(5);
  });
});
