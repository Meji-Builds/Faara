import { decodeAnswer, encodeAnswer, OFFLINE_MIN_RSSI, pickNearest } from '../offlineLink';

describe('offline link', () => {
  it('picks the closest phone and ignores ones too far away', () => {
    expect(
      pickNearest(
        new Map([
          ['far', OFFLINE_MIN_RSSI - 5],
          ['near', -52],
          ['middle', -66],
        ]),
      ),
    ).toBe('near');
    expect(pickNearest(new Map([['far', OFFLINE_MIN_RSSI - 1]]))).toBeNull();
    expect(pickNearest(new Map())).toBeNull();
  });

  it('round-trips answers and treats anything unreadable as a failure', () => {
    expect(decodeAnswer(encodeAnswer({ ok: true }))).toEqual({ ok: true });
    expect(decodeAnswer(encodeAnswer({ ok: false, reason: 'Pocket spent' }))).toEqual({
      ok: false,
      reason: 'Pocket spent',
    });
    expect(decodeAnswer('garbage').ok).toBe(false);
    expect(decodeAnswer('{"ok":"yes"}').ok).toBe(false);
  });
});
