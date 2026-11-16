import { BRAND_SHAPES, pickShapes } from '../shapes';
import { ValidationError, parseClaimHum, parseCreateHum } from '../validation';

describe('hum request validation', () => {
  it('accepts valid create requests and trims the note', () => {
    expect(parseCreateHum({ amount: 12500, currency: 'NGN', note: ' Suya ' })).toEqual({
      amount: 12500,
      currency: 'NGN',
      note: 'Suya',
    });
    expect(parseCreateHum({ amount: 40.5, currency: 'USDC' }).amount).toBe(40.5);
  });

  it.each([
    [{ amount: 0, currency: 'NGN' }],
    [{ amount: -5, currency: 'NGN' }],
    [{ amount: 10.5, currency: 'NGN' }],
    [{ amount: 1.234, currency: 'USDC' }],
    [{ amount: 100, currency: 'EUR' }],
    [{ amount: 1e9, currency: 'NGN' }],
    [{ amount: '100', currency: 'NGN' }],
    [{ amount: 100, currency: 'NGN', note: 'x'.repeat(61) }],
    [null],
  ])('rejects invalid create request %j', (body) => {
    expect(() => parseCreateHum(body)).toThrow(ValidationError);
  });

  it('normalises and validates claim tokens', () => {
    expect(parseClaimHum({ token: 'k72gekvhaa', channel: 'sound' }).token).toBe('K72GEKVHAA');
    expect(() => parseClaimHum({ token: 'K72GEKVHAU', channel: 'sound' })).toThrow(ValidationError);
    expect(() => parseClaimHum({ token: 'K72GEKVHAA', channel: 'pigeon' })).toThrow(
      ValidationError,
    );
    expect(() => parseClaimHum({ token: 'K72GEKVHAA', channel: 'sound', distanceCm: -1 })).toThrow(
      ValidationError,
    );
  });
});

describe('pickShapes', () => {
  it('returns three distinct brand shapes', () => {
    for (let seed = 0; seed < 50; seed++) {
      let s = seed;
      const shapes = pickShapes((n) => (s = (s * 31 + 7) % 997) % n);
      expect(new Set(shapes).size).toBe(3);
      shapes.forEach((shape) => expect(BRAND_SHAPES).toContain(shape));
    }
  });
});
