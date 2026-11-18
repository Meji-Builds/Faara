import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import { MOCK_STARTING_BALANCE_KOBO } from '../../../shared/hum';
import {
  OFFLINE_LIMITS,
  checkNote,
  noteMessage,
  parseOpenPocket,
  type SignedCertificate,
  type SignedNote,
  type SpendNote,
} from '../../../shared/offline';
import { ApiError } from '../errors';
import { generateSigner, verifySignature } from '../ed25519';
import { OfflineService } from '../offlineService';
import { MemoryStore } from '../store';

/** A phone's own signing key. */
function makeDevice() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return {
    publicKey: der.subarray(der.length - 32).toString('base64'),
    sign: (message: string) =>
      sign(null, Buffer.from(message, 'utf8'), privateKey as KeyObject).toString('base64'),
  };
}

function setup(withSigner = true) {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let ids = 0;
  const { signer } = generateSigner();
  const service = new OfflineService({
    store,
    now: () => clock,
    newId: () => `id${++ids}x${ids}abcdef`,
    signer: withSigner ? signer : null,
  });
  store.docs.set('users/ada', { fullName: 'Ada Okafor', username: 'ada.ok' });
  store.docs.set('users/tolu', { fullName: 'Tolu Adebayo', username: 'tolu.a' });
  return { store, service, signer, advance: (ms: number) => (clock += ms), now: () => clock };
}

let noteCounter = 0;
function makeNote(
  device: ReturnType<typeof makeDevice>,
  certificate: SignedCertificate,
  overrides: Partial<SpendNote> = {},
): SignedNote {
  const note: SpendNote = {
    noteId: `NOTE${++noteCounter}abcdefgh`,
    pocketId: certificate.certificate.pocketId,
    fromUid: 'ada',
    toUid: 'tolu',
    amountKobo: 300_000,
    nonce: 'nonce123456',
    sequence: noteCounter,
    createdAt: 1_000_500,
    ...overrides,
  };
  return { note, signature: device.sign(noteMessage(note)), certificate };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('opening a pocket', () => {
  it('locks the money and issues a certificate the server key signed', async () => {
    const { service, store, signer } = setup();
    const device = makeDevice();
    const cert = await service.openPocket('ada', {
      amountKobo: 1_000_000,
      devicePublicKey: device.publicKey,
    });
    expect(cert.certificate).toMatchObject({
      uid: 'ada',
      limitKobo: 1_000_000,
      maxNoteKobo: 500_000,
    });
    expect(store.docs.get('ledgerAccounts/ada')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO - 1_000_000,
    });
    expect(
      verifySignature(
        signer.publicKey,
        `faara-cert-v1|${cert.certificate.pocketId}|ada|${device.publicKey}|1000000|500000|${cert.certificate.issuedAt}|${cert.certificate.expiresAt}`,
        cert.signature,
      ),
    ).toBe(true);
  });

  it('allows one open pocket and needs the balance to cover it', async () => {
    const { service } = setup();
    const device = makeDevice();
    await service.openPocket('ada', { amountKobo: 500_000, devicePublicKey: device.publicKey });
    await expectApiError(
      service.openPocket('ada', { amountKobo: 500_000, devicePublicKey: device.publicKey }),
      'failed-precondition',
    );
    const poor = setup();
    poor.store.docs.set('ledgerAccounts/ada', { balanceKobo: 100, updatedAt: 0 });
    await expectApiError(
      poor.service.openPocket('ada', { amountKobo: 500_000, devicePublicKey: device.publicKey }),
      'failed-precondition',
    );
  });

  it('creates its own signing key when none is configured, and keeps using it', async () => {
    const first = setup(false);
    const device = makeDevice();
    const cert = await first.service.openPocket('ada', {
      amountKobo: 500_000,
      devicePublicKey: device.publicKey,
    });
    const keyDoc = first.store.docs.get('serverKeys/offline') as { pkcs8: string };
    expect(keyDoc.pkcs8).toBeTruthy();
    // A fresh service over the same store reuses the saved key, so earlier certificates still verify.
    const second = new OfflineService({
      store: first.store,
      now: () => 1_000_000,
      newId: () => 'z',
      signer: null,
    });
    const signed = makeNote(device, cert);
    expect((await second.settleNotes('tolu', [signed]))[0]?.status).toBe('settled');
  });

  it('refuses bad requests', () => {
    expect(() => parseOpenPocket({ amountKobo: 5, devicePublicKey: 'x' })).toThrow();
    expect(() =>
      parseOpenPocket({
        amountKobo: OFFLINE_LIMITS.maxPocketKobo + 1,
        devicePublicKey: makeDevice().publicKey,
      }),
    ).toThrow();
    expect(
      parseOpenPocket({ amountKobo: 500_000, devicePublicKey: makeDevice().publicKey }).amountKobo,
    ).toBe(500_000);
  });
});

describe('settling payments', () => {
  async function pocketFor(s: ReturnType<typeof setup>, amount = 600_000) {
    const device = makeDevice();
    const certificate = await s.service.openPocket('ada', {
      amountKobo: amount,
      devicePublicKey: device.publicKey,
    });
    return { device, certificate };
  }

  it('pays the receiver from the locked pocket and records both sides', async () => {
    const s = setup();
    const { device, certificate } = await pocketFor(s);
    const signed = makeNote(device, certificate);
    const results = await s.service.settleNotes('tolu', [signed]);
    expect(results).toEqual([{ noteId: signed.note.noteId, status: 'settled' }]);
    expect(s.store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO + 300_000,
    });
    expect(s.store.docs.get(`users/tolu/activity/${signed.note.noteId}`)).toMatchObject({
      direction: 'in',
      channel: 'offline',
      counterpartyName: 'Ada Okafor',
    });
    expect(s.store.docs.get(`users/ada/activity/${signed.note.noteId}`)).toMatchObject({
      direction: 'out',
    });
    expect((await s.service.status('ada'))?.remainingKobo).toBe(300_000);
  });

  it('settles a note once even if sent twice', async () => {
    const s = setup();
    const { device, certificate } = await pocketFor(s);
    const signed = makeNote(device, certificate);
    await s.service.settleNotes('tolu', [signed]);
    const again = await s.service.settleNotes('tolu', [signed]);
    expect(again[0]?.status).toBe('already-settled');
    expect(s.store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO + 300_000,
    });
  });

  it('never pays out more than the pocket holds', async () => {
    const s = setup();
    const { device, certificate } = await pocketFor(s, 600_000);
    const first = makeNote(device, certificate, { amountKobo: 400_000 });
    const second = makeNote(device, certificate, { amountKobo: 400_000, toUid: 'tolu' });
    const results = await s.service.settleNotes('tolu', [first, second]);
    expect(results.map((r) => r.status)).toEqual(['settled', 'rejected']);
    expect(results[1]?.reason).toMatch(/already been spent/);
  });

  it('rejects a tampered amount, a forged certificate and the wrong receiver', async () => {
    const s = setup();
    const { device, certificate } = await pocketFor(s);

    const tampered = makeNote(device, certificate);
    tampered.note = { ...tampered.note, amountKobo: 500_000 };
    expect((await s.service.settleNotes('tolu', [tampered]))[0]?.status).toBe('rejected');

    const other = generateSigner().signer;
    const forged: SignedCertificate = {
      certificate: certificate.certificate,
      signature: other.sign('whatever'),
    };
    expect((await s.service.settleNotes('tolu', [makeNote(device, forged)]))[0]?.status).toBe(
      'rejected',
    );

    const toSomeoneElse = makeNote(device, certificate);
    expect((await s.service.settleNotes('chidi', [toSomeoneElse]))[0]?.status).toBe('rejected');
  });

  it('rejects a note signed by a different phone', async () => {
    const s = setup();
    const { certificate } = await pocketFor(s);
    const thief = makeDevice();
    expect((await s.service.settleNotes('tolu', [makeNote(thief, certificate)]))[0]?.status).toBe(
      'rejected',
    );
  });

  it('refuses notes once the grace period after expiry has passed', async () => {
    const s = setup();
    const { device, certificate } = await pocketFor(s);
    const signed = makeNote(device, certificate);
    s.advance(OFFLINE_LIMITS.pocketTtlMs + OFFLINE_LIMITS.graceMs + 1);
    expect((await s.service.settleNotes('tolu', [signed]))[0]?.status).toBe('rejected');
  });
});

describe('releasing a pocket', () => {
  it('returns the unspent part only after expiry and the grace period', async () => {
    const s = setup();
    const device = makeDevice();
    const certificate = await s.service.openPocket('ada', {
      amountKobo: 600_000,
      devicePublicKey: device.publicKey,
    });
    await s.service.settleNotes('tolu', [makeNote(device, certificate, { amountKobo: 200_000 })]);
    await expectApiError(s.service.release('ada'), 'failed-precondition');
    s.advance(OFFLINE_LIMITS.pocketTtlMs + OFFLINE_LIMITS.graceMs);
    expect(await s.service.release('ada')).toEqual({ releasedKobo: 400_000 });
    expect(s.store.docs.get('ledgerAccounts/ada')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO - 600_000 + 400_000,
    });
    await expectApiError(s.service.release('ada'), 'not-found');
  });
});

describe('checking a note on the receiving phone', () => {
  it('works with no network and ties the note to the receiver’s challenge', async () => {
    const s = setup();
    const device = makeDevice();
    const certificate = await s.service.openPocket('ada', {
      amountKobo: 600_000,
      devicePublicKey: device.publicKey,
    });
    const signed = makeNote(device, certificate);
    const options = { serverPublicKey: s.signer.publicKey, verify: verifySignature, now: s.now() };
    expect(
      checkNote(signed, { ...options, expect: { toUid: 'tolu', nonce: 'nonce123456' } }),
    ).toEqual({ ok: true });
    expect(
      checkNote(signed, { ...options, expect: { toUid: 'tolu', nonce: 'different' } }).ok,
    ).toBe(false);
    expect(
      checkNote(signed, { ...options, expect: { toUid: 'chidi', nonce: 'nonce123456' } }).ok,
    ).toBe(false);
  });
});
