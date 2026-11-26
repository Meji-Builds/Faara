import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import { MOCK_STARTING_BALANCE_KOBO } from '../../../shared/hum';
import {
  OFFLINE_LIMITS,
  certificateMessage,
  checkNote,
  checkIdentity,
  decodeHumOffer,
  decodeHumPayment,
  encodeHumOffer,
  encodeHumPayment,
  noteMessage,
  parseOpenPocket,
  parseReclaim,
  parseReserve,
  parseTopUpPocket,
  shapesForNonce,
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

  it('shares the key phones need to check certificates offline', async () => {
    const s = setup();
    const device = makeDevice();
    const cert = await s.service.openPocket('ada', {
      amountKobo: 100_000,
      devicePublicKey: device.publicKey,
    });
    const key = await s.service.publicKey();
    expect(verifySignature(key, certificateMessage(cert.certificate), cert.signature)).toBe(true);
  });
});

describe('topping up a pocket', () => {
  it('opens a pocket when there is none, then adds to it on the same phone', async () => {
    const s = setup();
    const device = makeDevice();
    const first = await s.service.topUpPocket('ada', {
      addKobo: 1_000_000,
      devicePublicKey: device.publicKey,
    });
    expect(first.certificate.limitKobo).toBe(1_000_000);

    s.advance(3_600_000);
    const second = await s.service.topUpPocket('ada', {
      addKobo: 400_000,
      devicePublicKey: device.publicKey,
    });
    // Same pocket, a higher total limit, and a fresh 7 days.
    expect(second.certificate.pocketId).toBe(first.certificate.pocketId);
    expect(second.certificate.limitKobo).toBe(1_400_000);
    expect(second.certificate.expiresAt).toBe(s.now() + OFFLINE_LIMITS.pocketTtlMs);
    expect(
      verifySignature(s.signer.publicKey, certificateMessage(second.certificate), second.signature),
    ).toBe(true);
    expect(s.store.docs.get('ledgerAccounts/ada')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO - 1_400_000,
    });
    expect(s.store.docs.get(`pockets/${first.certificate.pocketId}`)).toMatchObject({
      remainingKobo: 1_400_000,
    });
  });

  it('pays notes from older and newer certificates out of the same locked money', async () => {
    const s = setup();
    const device = makeDevice();
    const old = await s.service.topUpPocket('ada', {
      addKobo: 500_000,
      devicePublicKey: device.publicKey,
    });
    const fresh = await s.service.topUpPocket('ada', {
      addKobo: 300_000,
      devicePublicKey: device.publicKey,
    });
    expect((await s.service.settleNotes('tolu', [makeNote(device, old)]))[0]?.status).toBe(
      'settled',
    );
    expect(
      (await s.service.settleNotes('tolu', [makeNote(device, fresh, { amountKobo: 500_000 })]))[0]
        ?.status,
    ).toBe('settled');
    // 800,000 locked; 300,000 + 500,000 paid; nothing more can come out.
    expect(
      (await s.service.settleNotes('tolu', [makeNote(device, fresh, { amountKobo: 100 })]))[0]
        ?.status,
    ).toBe('rejected');
  });

  it('keeps what is locked within the limit and the pocket tied to one phone', async () => {
    const s = setup();
    const device = makeDevice();
    await s.service.topUpPocket('ada', { addKobo: 1_500_000, devicePublicKey: device.publicKey });
    await expectApiError(
      s.service.topUpPocket('ada', { addKobo: 600_000, devicePublicKey: device.publicKey }),
      'failed-precondition',
    );
    await expectApiError(
      s.service.topUpPocket('ada', { addKobo: 100_000, devicePublicKey: makeDevice().publicKey }),
      'failed-precondition',
    );
    await expectApiError(
      setup().service.topUpPocket('ada', { addKobo: 0, devicePublicKey: device.publicKey }),
      'failed-precondition',
    );
    expect(() => parseTopUpPocket({ addKobo: -1, devicePublicKey: device.publicKey })).toThrow();
    expect(parseTopUpPocket({ addKobo: 0, devicePublicKey: device.publicKey }).addKobo).toBe(0);
  });
});

describe('settling from the paying phone', () => {
  it('lets the sender bring a payment in, and still pays the receiver', async () => {
    const s = setup();
    const device = makeDevice();
    const certificate = await s.service.openPocket('ada', {
      amountKobo: 600_000,
      devicePublicKey: device.publicKey,
    });
    const signed = makeNote(device, certificate);
    expect((await s.service.settleNotes('ada', [signed]))[0]?.status).toBe('settled');
    expect(s.store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO + 300_000,
    });
    // The receiver's phone bringing the same payment later changes nothing.
    expect((await s.service.settleNotes('tolu', [signed]))[0]?.status).toBe('already-settled');
  });
});

describe('offline hum over Bluetooth', () => {
  it('signs identity cards a phone can check with no network', async () => {
    const s = setup();
    const signed = await s.service.identity('tolu');
    expect(signed.card).toMatchObject({ uid: 'tolu', name: 'Tolu Adebayo' });
    const options = { serverPublicKey: s.signer.publicKey, verify: verifySignature, now: s.now() };
    expect(checkIdentity(signed, options)).toBe(true);
    // A nearby phone can't swap the name or reuse an old card.
    expect(checkIdentity({ ...signed, card: { ...signed.card, name: 'Mama Tolu' } }, options)).toBe(
      false,
    );
    expect(checkIdentity(signed, { ...options, now: signed.card.expiresAt + 1 })).toBe(false);
    await expectApiError(s.service.identity('nobody'), 'failed-precondition');
  });

  it('reads back only well-formed offers and payments', async () => {
    const s = setup();
    const identity = await s.service.identity('tolu');
    const offer = { identity, nonce: 'nonce123456' };
    expect(decodeHumOffer(encodeHumOffer(offer))).toEqual(offer);
    expect(decodeHumOffer('{"nonce":"x"}')).toBeNull();
    expect(decodeHumOffer('not json')).toBeNull();

    const device = makeDevice();
    const certificate = await s.service.openPocket('ada', {
      amountKobo: 600_000,
      devicePublicKey: device.publicKey,
    });
    const payment = { note: makeNote(device, certificate), fromName: 'Ada Okafor' };
    expect(decodeHumPayment(encodeHumPayment(payment))).toEqual(payment);
    expect(decodeHumPayment('{"note":{}}')).toBeNull();
  });

  it('shows the same three different shapes on both phones for a nonce', () => {
    const shapes = shapesForNonce('nonce123456');
    expect(shapesForNonce('nonce123456')).toEqual(shapes);
    expect(new Set(shapes).size).toBe(3);
    const seen = new Set(Array.from({ length: 300 }, (_, i) => shapesForNonce(`n${i}`).join(',')));
    expect(seen.size).toBeGreaterThan(60);
  });
});

describe('shop names on name cards', () => {
  it('signs the verified business name for vendors, and nothing for everyone else', async () => {
    const s = setup();
    s.store.docs.set('vendors/tolu', { businessName: 'Mama Tolu Foods' });
    const vendor = await s.service.identity('tolu');
    const person = await s.service.identity('ada');
    expect(vendor.card.shop).toBe('Mama Tolu Foods');
    expect(person.card.shop).toBe('');
    const options = { serverPublicKey: s.signer.publicKey, verify: verifySignature, now: s.now() };
    expect(checkIdentity(vendor, options)).toBe(true);
    expect(checkIdentity(person, options)).toBe(true);
    // Nobody can add a shop name Faara didn't sign.
    expect(checkIdentity({ ...person, card: { ...person.card, shop: 'Fake Shop' } }, options)).toBe(
      false,
    );
    expect(decodeHumOffer(encodeHumOffer({ identity: vendor, nonce: 'n1' }))?.identity).toEqual(
      vendor,
    );
  });
});

describe('restoring a pocket after a reinstall', () => {
  it('gives the same phone its pocket back, with what is left, and payments still settle', async () => {
    const s = setup();
    const device = makeDevice();
    const opened = await s.service.openPocket('ada', {
      amountKobo: 1_000_000,
      devicePublicKey: device.publicKey,
    });
    await s.service.settleNotes('tolu', [makeNote(device, opened, { amountKobo: 300_000 })]);

    const back = await s.service.reclaim('ada', device.publicKey);
    expect(back.remainingKobo).toBe(700_000);
    expect(back.certificate.certificate).toEqual(opened.certificate);
    expect(
      verifySignature(
        s.signer.publicKey,
        certificateMessage(back.certificate.certificate),
        back.certificate.signature,
      ),
    ).toBe(true);
    // A payment made with the restored certificate settles from the same locked money.
    const results = await s.service.settleNotes('tolu', [
      makeNote(device, back.certificate, { amountKobo: 200_000 }),
    ]);
    expect(results[0]?.status).toBe('settled');
    expect((await s.service.status('ada'))?.remainingKobo).toBe(500_000);
  });

  it('won’t hand the pocket to another phone, or restore one that isn’t there', async () => {
    const s = setup();
    await expectApiError(s.service.reclaim('ada', makeDevice().publicKey), 'not-found');
    const device = makeDevice();
    await s.service.openPocket('ada', { amountKobo: 500_000, devicePublicKey: device.publicKey });
    await expectApiError(s.service.reclaim('ada', makeDevice().publicKey), 'failed-precondition');
    await expectApiError(s.service.reclaim('tolu', device.publicKey), 'not-found');
  });

  it('keeps how much to keep ready on the account', async () => {
    const s = setup();
    expect(await s.service.reserve('ada')).toBeNull();
    await s.service.setReserve('ada', 1_000_000);
    expect(await s.service.reserve('ada')).toBe(1_000_000);
    expect(() => parseReserve({ reserveKobo: -5 })).toThrow();
    expect(() => parseReserve({ reserveKobo: OFFLINE_LIMITS.maxPocketKobo + 1 })).toThrow();
    expect(() => parseReclaim({ devicePublicKey: 'nope' })).toThrow();
  });
});

describe('moving a pocket to a new phone key', () => {
  it('moves it, and old and new payments share the same locked money', async () => {
    const s = setup();
    const oldPhone = makeDevice();
    const opened = await s.service.openPocket('ada', {
      amountKobo: 1_000_000,
      devicePublicKey: oldPhone.publicKey,
    });
    // Signed before the reinstall, not yet settled.
    const before = makeNote(oldPhone, opened, { amountKobo: 400_000 });

    const newPhone = makeDevice();
    // A different key can't simply reclaim it; it has to be moved.
    await expectApiError(s.service.reclaim('ada', newPhone.publicKey), 'failed-precondition');
    const moved = await s.service.move('ada', newPhone.publicKey);
    expect(moved.remainingKobo).toBe(1_000_000);
    expect(moved.certificate.certificate.devicePublicKey).toBe(newPhone.publicKey);
    expect(moved.certificate.certificate.pocketId).toBe(opened.certificate.pocketId);
    expect((await s.service.status('ada'))?.devicePublicKey).toBe(newPhone.publicKey);

    const after = makeNote(newPhone, moved.certificate, { amountKobo: 500_000 });
    const tooMuch = makeNote(newPhone, moved.certificate, { amountKobo: 300_000 });
    const results = await s.service.settleNotes('tolu', [after, before, tooMuch]);
    expect(results.map((r) => r.status)).toEqual(['settled', 'settled', 'rejected']);
    expect((await s.service.status('ada'))?.remainingKobo).toBe(100_000);
    // The new phone can now restore it after another reinstall.
    expect((await s.service.reclaim('ada', newPhone.publicKey)).remainingKobo).toBe(100_000);
  });

  it('needs an open pocket, and a key nobody used can’t settle', async () => {
    const s = setup();
    await expectApiError(s.service.move('ada', makeDevice().publicKey), 'not-found');
    const device = makeDevice();
    const opened = await s.service.openPocket('ada', {
      amountKobo: 500_000,
      devicePublicKey: device.publicKey,
    });
    await s.service.move('ada', makeDevice().publicKey);
    const stranger = makeDevice();
    const forged = makeNote(stranger, {
      ...opened,
      certificate: { ...opened.certificate, devicePublicKey: stranger.publicKey },
    });
    const results = await s.service.settleNotes('tolu', [forged]);
    expect(results[0]?.status).not.toBe('settled');
  });
});
