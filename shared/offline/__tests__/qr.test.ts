import { Buffer } from 'buffer';

import {
  decodeOfflineRequest,
  decodeSignedNote,
  encodeOfflineRequest,
  encodeSignedNote,
  readPaymentQr,
  type SignedNote,
} from '..';

const note: SignedNote = {
  note: {
    noteId: 'NT1',
    pocketId: 'PK1',
    fromUid: 'ada',
    toUid: 'tolu',
    amountKobo: 150_000,
    nonce: 'n0nce',
    sequence: 0,
    createdAt: 1_000,
  },
  signature: 'c2ln',
  certificate: {
    certificate: {
      pocketId: 'PK1',
      uid: 'ada',
      devicePublicKey: 'a2V5',
      limitKobo: 500_000,
      maxNoteKobo: 500_000,
      issuedAt: 0,
      expiresAt: 10_000,
    },
    signature: 'Y2VydA==',
  },
};

describe('offline QR codes', () => {
  it('round-trips a request, names included', () => {
    const request = { uid: 'tolu', name: 'Tolú Adébáyọ̀', nonce: 'abc123', amountKobo: 0 };
    expect(decodeOfflineRequest(encodeOfflineRequest(request))).toEqual(request);
  });

  it('encodes exactly like standard base64url, for any name', () => {
    for (const name of ['A', 'Ab', 'Abc', 'Ọlá', 'Chidi 🙌🏾', 'Ẹ̀gbọ́n ìyá']) {
      const request = { uid: 'u1', name, nonce: 'n', amountKobo: 0 };
      const code = encodeOfflineRequest(request);
      const expected = Buffer.from(JSON.stringify(request)).toString('base64url');
      expect(code.slice(code.indexOf(':') + 1)).toBe(expected);
      expect(decodeOfflineRequest(code)).toEqual(request);
    }
  });

  it('round-trips a signed payment', () => {
    expect(decodeSignedNote(encodeSignedNote(note))).toEqual(note);
  });

  it('carries the payer’s name alongside, unsigned', () => {
    expect(readPaymentQr(encodeSignedNote(note, 'Ada'))).toEqual({ note, fromName: 'Ada' });
    expect(readPaymentQr(encodeSignedNote(note))).toEqual({ note, fromName: null });
  });

  it('keeps a payment small enough for one QR code', () => {
    expect(encodeSignedNote(note).length).toBeLessThan(1_500);
  });

  it('rejects other codes and malformed data', () => {
    expect(decodeOfflineRequest('faara://hum/ABC')).toBeNull();
    expect(decodeOfflineRequest(encodeSignedNote(note))).toBeNull();
    expect(decodeSignedNote('FAARA-OFF1-N:not-json')).toBeNull();
    const bad = { ...note, note: { ...note.note, amountKobo: -5 } };
    expect(decodeSignedNote(encodeSignedNote(bad))).toBeNull();
    expect(
      decodeOfflineRequest(
        encodeOfflineRequest({ uid: 'a b', name: 'x', nonce: 'n', amountKobo: 1 }),
      ),
    ).toBeNull();
  });
});
