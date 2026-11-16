import {
  BRAND_SHAPES,
  HUM_CHOOSE_TTL_MS,
  HUM_TOKEN_TTL_MS,
  MAX_CLAIMS_PER_HUM,
  RATE_LIMITS,
} from '../../../shared/hum';
import { ApiError } from '../errors';
import { HumService, type ClaimDoc, type HumDoc } from '../humService';
import { MemoryStore } from '../store';

function setup() {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let seed = 7;
  let ids = 0;
  const service = new HumService({
    store,
    now: () => clock,
    // Deterministic mulberry32 so runs are reproducible.
    randomInt: (n) => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    },
    newId: () => `pay${++ids}`,
  });
  const addUser = (uid: string, fullName: string, username: string) =>
    store.docs.set(`users/${uid}`, { fullName, username });
  addUser('sender', 'Ada Okafor', 'ada.ok');
  addUser('tolu', 'Tolu Adebayo', 'tolu.a');
  addUser('kola', 'Kola Musa', 'kolamusa');
  return {
    store,
    service,
    addUser,
    advance: (ms: number) => (clock += ms),
    hum: (id: string) => store.docs.get(`hums/${id}`) as HumDoc,
    claim: (id: string, uid: string) =>
      store.docs.get(`hums/${id}/claims/${uid}`) as ClaimDoc | undefined,
  };
}

async function expectApiError(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

const ngn = { amount: 12_500, currency: 'NGN' as const, note: 'Suya & drinks' };

describe('HumService', () => {
  it('creates a hum with a 10-character token that expires in 30 s', async () => {
    const { service, hum } = setup();
    const created = await service.createHum('sender', ngn);
    expect(created.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(created.expiresAt - hum(created.paymentId).createdAt).toBe(HUM_TOKEN_TTL_MS);
    expect(hum(created.paymentId)).toMatchObject({
      senderUid: 'sender',
      amountMinor: 1_250_000,
      status: 'open',
    });
  });

  it('requires a profile to create a hum', async () => {
    const { service } = setup();
    await expectApiError(service.createHum('stranger', ngn), 'failed-precondition');
  });

  it('records claims with the claimant profile and returns sender details', async () => {
    const { service, claim, hum } = setup();
    const { paymentId, token } = await service.createHum('sender', ngn);
    const response = await service.claimHum('tolu', { token, channel: 'sound', distanceCm: 20 });
    expect(response).toMatchObject({
      paymentId,
      claimId: 'tolu',
      amount: 12_500,
      sender: { username: 'ada.ok' },
    });
    expect(claim(paymentId, 'tolu')).toMatchObject({
      fullName: 'Tolu Adebayo',
      distanceCm: 20,
      status: 'pending',
    });
    expect(hum(paymentId).claimCount).toBe(1);
  });

  it('treats a repeated claim from the same phone as the same claim', async () => {
    const { service, hum } = setup();
    const { paymentId, token } = await service.createHum('sender', ngn);
    await service.claimHum('tolu', { token, channel: 'sound' });
    await service.claimHum('tolu', { token, channel: 'bluetooth' });
    expect(hum(paymentId).claimCount).toBe(1);
  });

  it('rejects unknown tokens, own hums and expired tokens', async () => {
    const { service, advance } = setup();
    const { token } = await service.createHum('sender', ngn);
    await expectApiError(
      service.claimHum('tolu', { token: 'ZZZZZZZZZZ', channel: 'sound' }),
      'not-found',
    );
    await expectApiError(
      service.claimHum('sender', { token, channel: 'sound' }),
      'permission-denied',
    );
    advance(HUM_TOKEN_TTL_MS + 1);
    await expectApiError(service.claimHum('tolu', { token, channel: 'sound' }), 'expired');
  });

  it('caps the number of claimants', async () => {
    const { service, addUser } = setup();
    const { token } = await service.createHum('sender', ngn);
    for (let i = 0; i < MAX_CLAIMS_PER_HUM; i++) {
      addUser(`u${i}`, `User ${i}`, `user${i}`);
      await service.claimHum(`u${i}`, { token, channel: 'sound' });
    }
    await expectApiError(
      service.claimHum('tolu', { token, channel: 'sound' }),
      'resource-exhausted',
    );
  });

  it('lets only the sender choose, once, and gives both sides the same shapes', async () => {
    const { service, claim, hum } = setup();
    const { paymentId, token } = await service.createHum('sender', ngn);
    await service.claimHum('tolu', { token, channel: 'sound' });
    await service.claimHum('kola', { token, channel: 'sound' });

    await expectApiError(
      service.chooseRecipient('kola', { paymentId, claimId: 'kola' }),
      'not-found',
    );

    const chosen = await service.chooseRecipient('sender', { paymentId, claimId: 'tolu' });
    expect(new Set(chosen.shapes).size).toBe(3);
    chosen.shapes.forEach((shape) => expect(BRAND_SHAPES).toContain(shape));
    expect(chosen.recipient).toEqual({ fullName: 'Tolu Adebayo', username: 'tolu.a' });
    expect(hum(paymentId)).toMatchObject({
      status: 'chosen',
      chosenClaimId: 'tolu',
      shapes: chosen.shapes,
    });
    expect(claim(paymentId, 'tolu')).toMatchObject({ status: 'chosen', shapes: chosen.shapes });

    // Retrying the same choice is safe; switching recipient is not.
    await expect(
      service.chooseRecipient('sender', { paymentId, claimId: 'tolu' }),
    ).resolves.toEqual(chosen);
    await expectApiError(
      service.chooseRecipient('sender', { paymentId, claimId: 'kola' }),
      'already-chosen',
    );
  });

  it('closes the hum to new claims once a recipient is chosen', async () => {
    const { service } = setup();
    const { paymentId, token } = await service.createHum('sender', ngn);
    await service.claimHum('tolu', { token, channel: 'sound' });
    await service.chooseRecipient('sender', { paymentId, claimId: 'tolu' });
    await expectApiError(service.claimHum('kola', { token, channel: 'sound' }), 'already-chosen');
  });

  it('allows choosing after the token expires but not after the choose window', async () => {
    const { service, advance } = setup();
    const first = await service.createHum('sender', ngn);
    await service.claimHum('tolu', { token: first.token, channel: 'sound' });
    advance(HUM_TOKEN_TTL_MS + 1);
    await expect(
      service.chooseRecipient('sender', { paymentId: first.paymentId, claimId: 'tolu' }),
    ).resolves.toBeDefined();

    const second = await service.createHum('sender', ngn);
    await service.claimHum('kola', { token: second.token, channel: 'sound' });
    advance(HUM_CHOOSE_TTL_MS + 1);
    await expectApiError(
      service.chooseRecipient('sender', { paymentId: second.paymentId, claimId: 'kola' }),
      'expired',
    );
  });

  it('cancels open hums and stops further claims', async () => {
    const { service, hum } = setup();
    const { paymentId, token } = await service.createHum('sender', ngn);
    await service.cancelHum('sender', { paymentId });
    expect(hum(paymentId).status).toBe('cancelled');
    await expectApiError(service.claimHum('tolu', { token, channel: 'sound' }), 'expired');
    await expectApiError(service.cancelHum('tolu', { paymentId }), 'not-found');
  });

  it('rate-limits hum creation per user per minute', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < RATE_LIMITS.createHum; i++) await service.createHum('sender', ngn);
    await expectApiError(service.createHum('sender', ngn), 'resource-exhausted');
    advance(60_000);
    await expect(service.createHum('sender', ngn)).resolves.toBeDefined();
  });
});
