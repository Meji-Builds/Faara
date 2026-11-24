import { ed25519 } from '@noble/curves/ed25519';

import { certificateMessage, type PocketCertificate } from '@shared/offline';

import {
  EMPTY_LEDGER,
  applySettlement,
  applyTopUp,
  markDelivery,
  topUpNeeded,
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

describe('paying by Bluetooth', () => {
  it('settles a payment from the paying phone only once the receiver confirmed it', () => {
    const { ledger, note } = pay(pocketLedger(), 150_000);
    // Handed over but not confirmed: left for the receiver to settle.
    expect(waitingNotes(ledger)).toEqual([]);
    expect(waitingNotes(markDelivery(ledger, 'NT1', 'refused'))).toEqual([]);
    expect(waitingNotes(markDelivery(ledger, 'NT1', 'unknown'))).toEqual([]);
    const confirmed = markDelivery(ledger, 'NT1', 'confirmed');
    expect(waitingNotes(confirmed)).toEqual([note]);
    const settled = applySettlement(confirmed, [{ noteId: 'NT1', status: 'settled' }]);
    expect(settled.sent[0]?.status).toBe('settled');
    expect(waitingNotes(settled)).toEqual([]);
  });
});

describe('keeping money ready', () => {
  const DAY = 24 * 3_600_000;
  /** A pocket that runs for 7 days, like a real one. */
  const lasting = (ledger: OfflineLedger): OfflineLedger => {
    const pocket = ledger.pocket;
    if (!pocket) return ledger;
    const certificate = { ...pocket.signed.certificate, expiresAt: 7 * DAY };
    return { ...ledger, pocket: { ...pocket, signed: { ...pocket.signed, certificate } } };
  };
  const remote = (remainingKobo: number) => ({
    pocketId: 'PK1',
    limitKobo: 500_000,
    remainingKobo,
    expiresAt: 101_000,
    releasableAt: 200_000,
  });

  it('opens a pocket when there is none, and does nothing when it is off', () => {
    expect(topUpNeeded(EMPTY_LEDGER, 1_000_000, 0)).toBe(1_000_000);
    expect(topUpNeeded(EMPTY_LEDGER, 0, 0)).toBeNull();
    // A pocket held on another phone is left alone.
    expect(topUpNeeded({ ...EMPTY_LEDGER, remote: remote(100) }, 1_000_000, 0)).toBeNull();
  });

  it('refills what was spent, within what a pocket may hold', () => {
    const spent = pay(pocketLedger(500_000), 300_000).ledger;
    const ledger = { ...spent, remote: remote(500_000) };
    // ₦2,000 left of ₦5,000 wanted: add ₦3,000.
    expect(topUpNeeded(ledger, 500_000, 2_000)).toBe(300_000);
    // Already full enough: nothing to do.
    expect(
      topUpNeeded({ ...lasting(pocketLedger(500_000)), remote: remote(500_000) }, 500_000, 2_000),
    ).toBeNull();
    // Locked money not yet settled counts against the pocket limit.
    expect(topUpNeeded({ ...spent, remote: remote(1_900_000) }, 2_000_000, 2_000)).toBe(100_000);
  });

  it('renews a pocket shortly before it expires', () => {
    const ledger = { ...lasting(pocketLedger(500_000)), remote: remote(500_000) };
    expect(topUpNeeded(ledger, 500_000, 2_000)).toBeNull();
    expect(topUpNeeded(ledger, 500_000, 6 * DAY)).toBe(0);
  });

  it('keeps what this phone has spent when the same pocket is topped up', () => {
    const spent = pay(pocketLedger(500_000), 300_000).ledger;
    const signed = spent.pocket?.signed;
    if (!signed) throw new Error('no pocket');
    const bigger = {
      ...signed,
      certificate: { ...signed.certificate, limitKobo: 800_000 },
    };
    const next = applyTopUp(spent, bigger, 5_000);
    expect(next.pocket?.spentKobo).toBe(300_000);
    expect(next.pocket?.nextSequence).toBe(1);
    expect(next.pocket?.signed.certificate.limitKobo).toBe(800_000);
    const fresh = applyTopUp(
      spent,
      { ...bigger, certificate: { ...bigger.certificate, pocketId: 'PK2' } },
      5_000,
    );
    expect(fresh.pocket?.spentKobo).toBe(0);
  });
});
