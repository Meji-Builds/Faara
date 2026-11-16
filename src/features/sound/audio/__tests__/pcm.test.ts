import { base64ToBytes, bytesToBase64, floatToPcm16Base64, pcm16Base64ToFloat } from '../pcm';

describe('PCM conversion', () => {
  const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

  it('encodes RFC 4648 test vectors', () => {
    expect(bytesToBase64(ascii(''))).toBe('');
    expect(bytesToBase64(ascii('f'))).toBe('Zg==');
    expect(bytesToBase64(ascii('fo'))).toBe('Zm8=');
    expect(bytesToBase64(ascii('foo'))).toBe('Zm9v');
    expect(bytesToBase64(ascii('foobar'))).toBe('Zm9vYmFy');
  });

  it('round-trips arbitrary bytes for every padding length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('round-trips float samples through 16-bit PCM within quantisation error', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.9);
    const decoded = pcm16Base64ToFloat(floatToPcm16Base64(samples));
    expect(decoded).toHaveLength(samples.length);
    decoded.forEach((value, i) =>
      expect(Math.abs(value - (samples[i] as number))).toBeLessThan(1 / 16000),
    );
  });

  it('clamps out-of-range samples', () => {
    const decoded = pcm16Base64ToFloat(floatToPcm16Base64(Float32Array.from([2, -2])));
    expect(decoded[0]).toBeCloseTo(32767 / 32768, 5);
    expect(decoded[1]).toBeCloseTo(-32767 / 32768, 5);
  });
});
