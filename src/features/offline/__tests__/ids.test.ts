import { randomId } from '../ids';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256),
}));

describe('randomId', () => {
  it('makes ids the server and QR codes accept', () => {
    const id = randomId('WD');
    expect(id).toMatch(/^WD[A-Za-z0-9_-]{20}$/);
    expect(randomId('NT')).toMatch(/^NT[A-Za-z0-9_-]{20}$/);
  });
});
