import { ed25519 } from '@noble/curves/ed25519';

import { certificateMessage, type PocketCertificate } from '@shared/offline';

import {
  EMPTY_LEDGER,
  applySettlement,
  maxPayment,
  payOffline,
  receiveOffline,
  toBase64,
  waitingNotes,
  type OfflineLedger,
} from '../ledger';

const encode = (text: string) => new TextEncoder().encode(text);

const server = ed25519.utils.randomPrivateKey();
const phone = ed25519.utils.randomPrivateKey();
/** The wallet secret key as Solana stores it: seed followed by public key. */
const phoneSecret = new Uint8Array([...phone, ...ed25519.getPublicKey(phone)]);

function pocketLedger(limitKobo = 500_000, now = 1_000): OfflineLedger {
  const certificate: PocketCertificate = {
    pocketId: 'PK1',
    uid: 'ada',
    devicePublicKey: toBase64(ed25519.getPublicKey(phone)),
    limitKobo,
    maxNoteKobo: Math.min(limitKobo, 300_000),
    issuedAt: now,
    expiresAt: now + 100_000,
  };
  return {
    ...EMPTY_LEDGER,
    serverPublicKey: toBase64(ed25519.getPublicKey(server)),
    pocket: {
      signed: {
        certificate,
        signature: toBase64(ed25519.sign(encode(certificateMessage(certificate)), server)),
      },
      spentKobo: 0,
      nextSequence: 0,
      openedAt: now,
    },
  };
}

const request = { uid: 'tolu', name: 'Tolu', nonce: 'nonce1', amountKobo: 0 };
const receiver = { ...EMPTY_LEDGER, serverPublicKey: toBase64(ed25519.getPublicKey(server)) };

function pay(ledger: OfflineLedger, amountKobo: number, noteId = 'NT1') {
  return payOffline(ledger, {
    request,
    amountKobo,
    fromUid: 'ada',
    secretKey: phoneSecret,
    now: 2_000,
    noteId,
  });
}

describe('offline ledger', () => {
  it('pays, and the receiver can check it with no network', () => {
    const { ledger, note } = pay(pocketLedger(), 150_000);
    expect(ledger.pocket?.spentKobo).toBe(150_000);
    expect(ledger.sent).toHaveLength(1);
    const got = receiveOffline(receiver, { note, fromName: 'Ada', request, now: 3_000 });
    expect(got.error).toBeNull();
    expect(waitingNotes(got.ledger)).toEqual([note]);
  });

  it('never signs more than the pocket or one payment allows', () => {
    const ledger = pocketLedger(400_000);
    expect(maxPayment(ledger.pocket, 2_000)).toBe(300_000);
    expect(() => pay(ledger, 300_001)).toThrow();
    const first = pay(ledger, 300_000).ledger;
    expect(maxPayment(first.pocket, 2_000)).toBe(100_000);
    expect(() => pay(first, 100_001, 'NT2')).toThrow();
  });

  it('refuses a payment meant for someone else, or tampered with', () => {
    const { note } = pay(pocketLedger(), 100_000);
    const other = receiveOffline(receiver, {
      note,
      fromName: null,
      request: { ...request, nonce: 'different' },
      now: 3_000,
    });
    expect(other.error).not.toBeNull();
    const raised = { ...note, note: { ...note.note, amountKobo: 900_000 } };
    expect(
      receiveOffline(receiver, { note: raised, fromName: null, request, now: 3_000 }).error,
    ).not.toBeNull();
  });

  it('keeps a payment once even if scanned twice', () => {
    const { note } = pay(pocketLedger(), 100_000);
    const once = receiveOffline(receiver, { note, fromName: null, request, now: 3_000 }).ledger;
    const twice = receiveOffline(once, { note, fromName: null, request, now: 3_000 }).ledger;
    expect(twice.received).toHaveLength(1);
  });

  it('can’t receive before knowing Faara’s key', () => {
    const { note } = pay(pocketLedger(), 100_000);
    expect(
      receiveOffline(EMPTY_LEDGER, { note, fromName: null, request, now: 3_000 }).error,
    ).not.toBeNull();
  });

  it('records settlement results', () => {
    const { note } = pay(pocketLedger(), 100_000);
    const got = receiveOffline(receiver, { note, fromName: null, request, now: 3_000 }).ledger;
    const settled = applySettlement(got, [{ noteId: 'NT1', status: 'settled' }]);
    expect(settled.received[0]?.status).toBe('settled');
    expect(waitingNotes(settled)).toEqual([]);
  });

  it('won’t sign with a different phone’s key', () => {
    const stranger = ed25519.utils.randomPrivateKey();
    expect(() =>
      payOffline(pocketLedger(), {
        request,
        amountKobo: 100,
        fromUid: 'ada',
        secretKey: new Uint8Array([...stranger, ...ed25519.getPublicKey(stranger)]),
        now: 2_000,
        noteId: 'NT9',
      }),
    ).toThrow();
  });
});
