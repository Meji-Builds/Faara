import { MOCK_STARTING_BALANCE_KOBO, RATE_LIMITS } from '../../../shared/hum';
import { QUOTE_TTL_MS, parseQuoteRequest, priceConversion } from '../../../shared/convert';
import { ApiError } from '../errors';
import { ConvertService, MockExchange, type UsdcRail } from '../convertService';
import { MemoryStore } from '../store';

const RATE = 1_500;

/** A stand-in for Circle: holds wallet balances and confirms transfers when told to. */
function fakeRail(initialCents = 0) {
  const state = {
    wallet: initialCents,
    sends: [] as string[],
    next: 'done' as 'done' | 'pending' | 'failed',
    failSend: false,
  };
  const rail: UsdcRail = {
    usdcCents: async () => state.wallet,
    send: async (kind, _uid, cents, key) => {
      if (state.failSend) throw new Error('circle down');
      state.sends.push(`${kind}:${cents}:${key}`);
      if (state.next === 'done') state.wallet += kind === 'payout' ? cents : -cents;
      return `tx${state.sends.length}`;
    },
    transferState: async () => state.next,
  };
  return { rail, state };
}

function setup(walletCents = 0) {
  const store = new MemoryStore();
  const { rail, state: wallet } = fakeRail(walletCents);
  let clock = 1_000_000;
  let ids = 0;
  const service = new ConvertService({
    store,
    now: () => clock,
    newId: () => `id${++ids}x${ids}abcdef`,
    exchange: new MockExchange(RATE, () => clock),
    usdc: rail,
  });
  return { store, service, wallet, advance: (ms: number) => (clock += ms) };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('pricing', () => {
  const rates = { ngnPerUsd: RATE, asOf: 0 };

  it('takes the fee out of what is received', () => {
    // ₦150,000 -> $100 mid, minus 1% = $99.00
    const priced = priceConversion('NGN', 'USD', 15_000_000, rates);
    expect(priced.toMinor).toBe(9_900);
    expect(priced.feeMinor).toBe(100);
  });

  it('prices dollars to USDC at par with a small fee', () => {
    const priced = priceConversion('USD', 'USDC', 10_000, rates);
    expect(priced.toMinor).toBe(9_975);
  });

  it('chains consistently: naira to USDC matches naira to dollars', () => {
    expect(priceConversion('NGN', 'USDC', 15_000_000, rates).toMinor).toBe(9_900);
  });

  it('never pays out more than was given at mid-market', () => {
    const there = priceConversion('USDC', 'NGN', 10_000, rates);
    const back = priceConversion('NGN', 'USDC', there.toMinor, rates);
    expect(back.toMinor).toBeLessThan(10_000);
  });
});

describe('validation', () => {
  it('accepts a sensible request and rejects bad ones', () => {
    expect(parseQuoteRequest({ from: 'NGN', to: 'USDC', amount: 5_000 })).toEqual({
      from: 'NGN',
      to: 'USDC',
      amount: 5_000,
    });
    for (const bad of [
      { from: 'NGN', to: 'NGN', amount: 500 },
      { from: 'EUR', to: 'NGN', amount: 5 },
      { from: 'USD', to: 'NGN', amount: 0 },
      { from: 'USD', to: 'NGN', amount: 1.234 },
      { from: 'NGN', to: 'USD', amount: 50 },
      { from: 'USD', to: 'NGN', amount: 99_999 },
      null,
    ]) {
      expect(() => parseQuoteRequest(bad)).toThrow();
    }
  });
});

describe('ConvertService', () => {
  it('buys USDC: takes the naira and sends the USDC to the wallet', async () => {
    const { service, wallet } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    expect(quote.toMinor).toBe(990);
    const result = await service.execute('ada', quote.id);
    expect(result.status).toBe('done');
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO - 1_500_000);
    expect(wallet.sends).toEqual([`payout:990:${quote.id}`]);
    expect(wallet.wallet).toBe(990);
  });

  it('sells USDC: collects it from the wallet and credits the naira', async () => {
    const { service, wallet } = setup(5_000);
    const quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    const result = await service.execute('ada', quote.id);
    expect(result.status).toBe('done');
    expect(wallet.wallet).toBe(3_000);
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO + quote.toMinor);
  });

  it('stays pending until the transfer confirms, then finishes once', async () => {
    const { service, wallet } = setup(5_000);
    wallet.next = 'pending';
    const quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    const started = await service.execute('ada', quote.id);
    expect(started.status).toBe('pending');
    expect(started.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
    wallet.next = 'done';
    const done = await service.settle('ada', quote.id);
    const again = await service.settle('ada', quote.id);
    expect(done.status).toBe('done');
    expect(again.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO + quote.toMinor);
  });

  it('runs a quote once even when asked twice', async () => {
    const { service, wallet } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    const first = await service.execute('ada', quote.id);
    const second = await service.execute('ada', quote.id);
    expect(second).toEqual(first);
    expect(wallet.sends).toHaveLength(1);
  });

  it('gives the naira back if the transfer fails to start', async () => {
    const { service, wallet } = setup();
    wallet.failSend = true;
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await expect(service.execute('ada', quote.id)).rejects.toThrow('circle down');
    expect((await service.balances('ada')).NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
  });

  it('refunds the naira if the transfer fails afterwards', async () => {
    const { service, wallet } = setup();
    wallet.next = 'pending';
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await service.execute('ada', quote.id);
    wallet.next = 'failed';
    const result = await service.settle('ada', quote.id);
    expect(result.status).toBe('failed');
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
  });

  it('refuses an expired quote', async () => {
    const { service, advance } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    advance(QUOTE_TTL_MS + 1);
    await expectApiError(service.execute('ada', quote.id), 'expired');
  });

  it("won't run someone else's quote", async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await expectApiError(service.execute('tolu', quote.id), 'not-found');
  });

  it('needs the wallet to hold the USDC being sold', async () => {
    const { service } = setup(500);
    const quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 50 });
    await expectApiError(service.execute('ada', quote.id), 'failed-precondition');
  });

  it('needs enough naira to buy', async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 4_999_999 });
    await expectApiError(service.execute('ada', quote.id), 'failed-precondition');
  });

  it('has no dollar conversions', async () => {
    const { service } = setup();
    await expectApiError(
      service.quote('ada', { from: 'NGN', to: 'USD', amount: 15_000 }),
      'failed-precondition',
    );
  });

  it('is off when USDC wallets are not set up', async () => {
    const store = new MemoryStore();
    const service = new ConvertService({
      store,
      now: () => 1,
      newId: () => 'idabcdefgh',
      exchange: new MockExchange(RATE, () => 1),
    });
    await expectApiError(
      service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 }),
      'failed-precondition',
    );
  });

  it('limits how fast quotes can be requested', async () => {
    const { service } = setup();
    for (let i = 0; i < RATE_LIMITS.convert; i++) {
      await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 1_000 });
    }
    await expectApiError(
      service.quote('ada', { from: 'NGN', to: 'USDC', amount: 1_000 }),
      'resource-exhausted',
    );
  });
});
