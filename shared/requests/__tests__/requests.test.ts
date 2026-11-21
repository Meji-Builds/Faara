import { parseCreateRequest, parseRequestId } from '..';

describe('payment request validation', () => {
  it('accepts a request to anyone or to one person', () => {
    expect(parseCreateRequest({ amountKobo: 500_000, note: ' Garri ' })).toEqual({
      amountKobo: 500_000,
      note: 'Garri',
      fromUsername: null,
    });
    expect(
      parseCreateRequest({ amountKobo: 500_000, note: 'Rent', fromUsername: '@Tolu.A' }),
    ).toMatchObject({ fromUsername: 'tolu.a' });
  });

  it('rejects bad amounts, notes and usernames', () => {
    for (const bad of [
      { amountKobo: 50, note: 'x' },
      { amountKobo: 10_000.5, note: 'x' },
      { amountKobo: 10_000, note: '' },
      { amountKobo: 10_000, note: 'x'.repeat(101) },
      { amountKobo: 10_000, note: 'x', fromUsername: 'a b' },
    ]) {
      expect(() => parseCreateRequest(bad)).toThrow();
    }
    expect(() => parseRequestId({ id: 'nope' })).toThrow();
    expect(parseRequestId({ id: 'RQabcdefgh12' })).toEqual({ id: 'RQabcdefgh12' });
  });
});
