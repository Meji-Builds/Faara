import {
  BRAND_SHAPES,
  HUM_CHOOSE_TTL_MS,
  HUM_TOKEN_TTL_MS,
  MAX_CLAIMS_PER_HUM,
  RATE_LIMITS,
} from '../../../shared/hum';
import { ApiError } from '../errors';
import { HumService, type ClaimDoc, type HumDoc } from '../humService';
import { MockNairaLedger } from '../naira';
import { MemoryStore } from '../store';
import type { ParsedTransaction } from '../../../shared/solana';

const SENDER_WALLET = 'SenderWa11et1111111111111111111111111111111';
const TOLU_WALLET = 'ToLuWa11et111111111111111111111111111111111';
const SIGNATURE = '5'.repeat(88);

function setup() {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let seed = 7;
  let ids = 0;
  const transactions = new Map<string, ParsedTransaction>();
  const walletRisks = new Map<string, { score: number; topIssue: string | null }>();
  const service = new HumService({
    store,
    now: () => clock,
    naira: new MockNairaLedger(store, () => clock),
    fetchTransaction: async (signature) => transactions.get(signature) ?? null,
    walletRisk: async (address: string) => walletRisks.get(address) ?? null,
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
  const addUser = (uid: string, fullName: string, username: string, walletAddress?: string) =>
    store.docs.set(`users/${uid}`, {
      fullName,
      username,
      ...(walletAddress ? { walletAddress } : {}),
    });
  addUser('sender', 'Ada Okafor', 'ada.ok', SENDER_WALLET);
  addUser('tolu', 'Tolu Adebayo', 'tolu.a', TOLU_WALLET);
  addUser('kola', 'Kola Musa', 'kolamusa');
  return {
    store,
    service,
    transactions,
    walletRisks,
    advanceClock: (ms: number) => (clock += ms),
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
    expect(chosen.recipient).toEqual({
      fullName: 'Tolu Adebayo',
      username: 'tolu.a',
      walletAddress: TOLU_WALLET,
    });
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

describe('HumService manual codes', () => {
  it('issues a six-digit manual code that claims the same hum', async () => {
    const { service, claim } = setup();
    const created = await service.createHum('sender', ngn);
    expect(created.manualCode).toMatch(/^\d{6}$/);
    const response = await service.claimHum('tolu', {
      manualCode: created.manualCode,
      channel: 'manual',
    });
    expect(response.paymentId).toBe(created.paymentId);
    expect(claim(created.paymentId, 'tolu')?.channel).toBe('manual');
  });

  it('expires manual codes with the hum and limits guessing', async () => {
    const { service, advance } = setup();
    const created = await service.createHum('sender', ngn);
    for (let i = 0; i < RATE_LIMITS.claimManual; i++) {
      await expectApiError(
        service.claimHum('tolu', { manualCode: '000000', channel: 'manual' }),
        'not-found',
      );
    }
    await expectApiError(
      service.claimHum('tolu', { manualCode: created.manualCode, channel: 'manual' }),
      'resource-exhausted',
    );
    advance(60_000 + HUM_TOKEN_TTL_MS);
    await expectApiError(
      service.claimHum('tolu', { manualCode: created.manualCode, channel: 'manual' }),
      'expired',
    );
  });
});

/** A jsonParsed transaction moving `amount` USDC base units between two wallets. */
function usdcTransfer(from: string, to: string, amount: bigint): ParsedTransaction {
  const entry = (owner: string, value: bigint) => ({
    owner,
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    uiTokenAmount: { amount: value.toString() },
  });
  return {
    meta: {
      err: null,
      preTokenBalances: [entry(from, 100_000_000n), entry(to, 0n)],
      postTokenBalances: [entry(from, 100_000_000n - amount), entry(to, amount)],
    },
  };
}

async function chosenHum(currency: 'NGN' | 'USDC', amount: number) {
  const env = setup();
  const created = await env.service.createHum('sender', { amount, currency });
  await env.service.claimHum('tolu', { token: created.token, channel: 'sound' });
  await env.service.chooseRecipient('sender', { paymentId: created.paymentId, claimId: 'tolu' });
  return { ...env, paymentId: created.paymentId };
}

describe('HumService settlement', () => {
  it('moves naira on the ledger once, and records activity for both people', async () => {
    const { service, store, hum, claim, paymentId } = await chosenHum('NGN', 12_500);
    const result = await service.settleHum('sender', { paymentId });
    expect(hum(paymentId)).toMatchObject({ status: 'settled', settledAt: result.settledAt });
    expect(claim(paymentId, 'tolu')?.status).toBe('settled');
    expect(store.docs.get('ledgerAccounts/sender')).toMatchObject({
      balanceKobo: 20_000_000 - 1_250_000,
    });
    expect(store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: 20_000_000 + 1_250_000,
    });
    expect(store.docs.get(`users/sender/activity/${paymentId}`)).toMatchObject({
      direction: 'out',
      counterpartyUsername: 'tolu.a',
    });
    expect(store.docs.get(`users/tolu/activity/${paymentId}`)).toMatchObject({
      direction: 'in',
      counterpartyUsername: 'ada.ok',
    });

    // Retrying does not pay twice.
    await expect(service.settleHum('sender', { paymentId })).resolves.toEqual(result);
    expect(store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: 20_000_000 + 1_250_000,
    });
  });

  it('refuses naira payments above the balance', async () => {
    const { service, paymentId } = await chosenHum('NGN', 5_000_000);
    await expectApiError(service.settleHum('sender', { paymentId }), 'failed-precondition');
  });

  it('only lets the sender settle, and only after choosing', async () => {
    const env = setup();
    const { paymentId, token } = await env.service.createHum('sender', ngn);
    await expectApiError(env.service.settleHum('sender', { paymentId }), 'failed-precondition');
    await env.service.claimHum('tolu', { token, channel: 'sound' });
    await env.service.chooseRecipient('sender', { paymentId, claimId: 'tolu' });
    await expectApiError(env.service.settleHum('tolu', { paymentId }), 'not-found');
  });

  it('settles USDC only with a matching on-chain transfer', async () => {
    const { service, transactions, hum, paymentId } = await chosenHum('USDC', 40.5);
    await expectApiError(service.settleHum('sender', { paymentId }), 'invalid-argument');

    transactions.set(SIGNATURE, usdcTransfer(SENDER_WALLET, TOLU_WALLET, 40_000_000n));
    await expectApiError(
      service.settleHum('sender', { paymentId, signature: SIGNATURE }),
      'failed-precondition',
    );

    transactions.set(SIGNATURE, usdcTransfer(SENDER_WALLET, TOLU_WALLET, 40_500_000n));
    const result = await service.settleHum('sender', { paymentId, signature: SIGNATURE });
    expect(result.signature).toBe(SIGNATURE);
    expect(hum(paymentId)).toMatchObject({ status: 'settled', signature: SIGNATURE });
  });

  it('never lets one transaction pay for two hums', async () => {
    const env = await chosenHum('USDC', 40.5);
    env.transactions.set(SIGNATURE, usdcTransfer(SENDER_WALLET, TOLU_WALLET, 40_500_000n));
    await env.service.settleHum('sender', { paymentId: env.paymentId, signature: SIGNATURE });

    const second = await env.service.createHum('sender', { amount: 40.5, currency: 'USDC' });
    await env.service.claimHum('tolu', { token: second.token, channel: 'sound' });
    await env.service.chooseRecipient('sender', { paymentId: second.paymentId, claimId: 'tolu' });
    await expectApiError(
      env.service.settleHum('sender', { paymentId: second.paymentId, signature: SIGNATURE }),
      'failed-precondition',
    );
  });

  it('requires wallets for USDC hums', async () => {
    const env = setup();
    env.addUser('nowallet', 'No Wallet', 'nowallet');
    await expectApiError(
      env.service.createHum('nowallet', { amount: 5, currency: 'USDC' }),
      'failed-precondition',
    );
    const { paymentId, token } = await env.service.createHum('sender', {
      amount: 5,
      currency: 'USDC',
    });
    await env.service.claimHum('kola', { token, channel: 'sound' });
    await expectApiError(
      env.service.chooseRecipient('sender', { paymentId, claimId: 'kola' }),
      'failed-precondition',
    );
  });
});

describe('HumService safety assessment', () => {
  it('flags new accounts and stores the badge on the claim', async () => {
    const env = setup();
    env.store.docs.set('users/tolu', {
      fullName: 'Tolu Adebayo',
      username: 'tolu.a',
      createdAt: 1_000_000 - 3 * 86_400_000,
    });
    const { paymentId, token } = await env.service.createHum('sender', ngn);
    await env.service.claimHum('tolu', { token, channel: 'sound' });
    const safety = await env.service.assessClaim(paymentId, 'tolu');
    expect(safety).toMatchObject({ level: 'caution', headline: 'New account · 3 days old' });
    expect(env.claim(paymentId, 'tolu')?.safety).toEqual(safety);
  });

  it('uses the wallet check for USDC and counts past payments', async () => {
    const env = await chosenHum('USDC', 10);
    env.walletRisks.set(TOLU_WALLET, { score: 4, topIssue: null });
    env.transactions.set(SIGNATURE, usdcTransfer(SENDER_WALLET, TOLU_WALLET, 10_000_000n));
    await env.service.settleHum('sender', { paymentId: env.paymentId, signature: SIGNATURE });

    const next = await env.service.createHum('sender', { amount: 1, currency: 'USDC' });
    await env.service.claimHum('tolu', { token: next.token, channel: 'sound' });
    await expect(env.service.assessClaim(next.paymentId, 'tolu')).resolves.toMatchObject({
      level: 'low',
      headline: 'Wallet checked · Low risk',
      detail: 'Paid 1× before',
    });

    env.walletRisks.set(TOLU_WALLET, { score: 91, topIssue: 'Drainer' });
    await expect(env.service.assessClaim(next.paymentId, 'tolu')).resolves.toMatchObject({
      level: 'high',
      headline: 'High risk · Drainer',
    });
  });
});

describe('HumService send by username', () => {
  function withUsernames() {
    const env = setup();
    env.store.docs.set('usernames/tolu.a', { uid: 'tolu' });
    env.store.docs.set('usernames/ada.ok', { uid: 'sender' });
    return env;
  }

  it('looks people up by username without exposing private fields', async () => {
    const { service } = withUsernames();
    await expect(service.lookupUser('sender', { username: 'tolu.a' })).resolves.toEqual({
      fullName: 'Tolu Adebayo',
      username: 'tolu.a',
      hasWallet: true,
    });
    await expectApiError(service.lookupUser('sender', { username: 'nobody' }), 'not-found');
  });

  it('creates an addressed payment that settles like a hum', async () => {
    const { service, store } = withUsernames();
    const transfer = await service.createTransfer('sender', {
      username: 'tolu.a',
      amount: 2_000,
      currency: 'NGN',
    });
    expect(transfer.recipient.username).toBe('tolu.a');
    await service.settleHum('sender', { paymentId: transfer.paymentId });
    expect(store.docs.get('ledgerAccounts/tolu')).toMatchObject({
      balanceKobo: 20_000_000 + 200_000,
    });
    expect(store.docs.get(`users/tolu/activity/${transfer.paymentId}`)).toMatchObject({
      kind: 'transfer',
      direction: 'in',
    });
  });

  it('refuses sending to yourself or to unknown usernames', async () => {
    const { service } = withUsernames();
    await expectApiError(
      service.createTransfer('sender', { username: 'ada.ok', amount: 5, currency: 'NGN' }),
      'invalid-argument',
    );
    await expectApiError(
      service.createTransfer('sender', { username: 'ghost', amount: 5, currency: 'NGN' }),
      'not-found',
    );
  });
});
