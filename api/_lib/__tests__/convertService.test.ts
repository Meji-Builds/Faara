import { MOCK_STARTING_BALANCE_KOBO, RATE_LIMITS } from '../../../shared/hum';
import { QUOTE_TTL_MS, parseQuoteRequest, priceConversion } from '../../../shared/convert';
import { ApiError } from '../errors';
import { ConvertService, MockExchange, type UsdcRail } from '../convertService';
import { MemoryStore } from '../store';

const RATE = 1_500;

const FLOAT = 'FloatAddress1111111111111111111111111111111';
const ADA_WALLET = 'AdaWa11et111111111111111111111111111111111';

/** A stand-in for Circle's float: pays out, and confirms transfers when told to. */
function fakeRail() {
  const state = {
    float: 1_000_000,
    payouts: [] as string[],
    next: 'done' as 'done' | 'pending' | 'failed',
    failSend: false,
  };
  const rail: UsdcRail = {
    floatCents: async () => state.float,
    floatAddress: async () => FLOAT,
    payout: async (address, cents, key) => {
      if (state.failSend) throw new Error('circle down');
      state.payouts.push(`${address}:${cents}:${key}`);
      return `tx${state.payouts.length}`;
    },
    transferState: async () => state.next,
  };
  return { rail, state };
}

function setup() {
  const store = new MemoryStore();
  const { rail, state: wallet } = fakeRail();
  let clock = 1_000_000;
  let ids = 0;
  /** USDC payments "on the blockchain": signature -> who paid whom how much. */
  const chain = new Map<string, { from: string; to: string; cents: number }>();
  const wallets = new Map<string, string>([['ada', ADA_WALLET]]);
  const service = new ConvertService({
    store,
    now: () => clock,
    newId: () => `id${++ids}x${ids}abcdef`,
    exchange: new MockExchange(RATE, () => clock),
    usdc: rail,
    walletOf: async (uid) => wallets.get(uid) ?? null,
    paidOnChain: async (signature, from, to, cents) => {
      const paid = chain.get(signature);
      return paid?.from === from && paid.to === to && paid.cents === cents;
    },
  });
  const pay = (signature: string, cents: number, from = ADA_WALLET, to = FLOAT) =>
    chain.set(signature, { from, to, cents });
  return { store, service, wallet, wallets, pay, advance: (ms: number) => (clock += ms) };
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
  it('buys USDC: takes the naira and pays the USDC to the person’s own wallet', async () => {
    const { service, wallet } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    expect(quote.toMinor).toBe(990);
    expect(quote.payTo).toBeUndefined();
    const result = await service.execute('ada', quote.id);
    expect(result.status).toBe('done');
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO - 1_500_000);
    expect(wallet.payouts).toEqual([`${ADA_WALLET}:990:${quote.id}`]);
  });

  it('sells USDC: credits the naira once the person’s payment to the float is confirmed', async () => {
    const { service, pay } = setup();
    const quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    expect(quote.payTo).toBe(FLOAT);
    pay('SIG1', 2_000);
    const result = await service.execute('ada', quote.id, 'SIG1');
    expect(result.status).toBe('done');
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO + quote.toMinor);
    // Asking again changes nothing.
    expect((await service.execute('ada', quote.id, 'SIG1')).balances.NGN).toBe(
      MOCK_STARTING_BALANCE_KOBO + quote.toMinor,
    );
  });

  it('won’t credit a sale that wasn’t paid, was paid wrong, or reuses a payment', async () => {
    const { service, pay } = setup();
    const quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    await expectApiError(service.execute('ada', quote.id), 'invalid-argument');
    await expectApiError(service.execute('ada', quote.id, 'NOPE'), 'failed-precondition');
    pay('SHORT', 1_999);
    await expectApiError(service.execute('ada', quote.id, 'SHORT'), 'failed-precondition');
    pay('ELSEWHERE', 2_000, ADA_WALLET, 'SomeoneElse');
    await expectApiError(service.execute('ada', quote.id, 'ELSEWHERE'), 'failed-precondition');
    pay('NOTADA', 2_000, 'Stranger');
    await expectApiError(service.execute('ada', quote.id, 'NOTADA'), 'failed-precondition');
    expect((await service.balances('ada')).NGN).toBe(MOCK_STARTING_BALANCE_KOBO);

    pay('SIG1', 2_000);
    await service.execute('ada', quote.id, 'SIG1');
    const second = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    await expectApiError(service.execute('ada', second.id, 'SIG1'), 'failed-precondition');
  });

  it('honours a sale paid just after the rate ran out, but not long after', async () => {
    const late = setup();
    const quote = await late.service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    late.advance(QUOTE_TTL_MS + 60_000);
    late.pay('SIG1', 2_000);
    expect((await late.service.execute('ada', quote.id, 'SIG1')).status).toBe('done');

    const tooLate = setup();
    const old = await tooLate.service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    tooLate.advance(QUOTE_TTL_MS + 11 * 60_000);
    tooLate.pay('SIG2', 2_000);
    await expectApiError(tooLate.service.execute('ada', old.id, 'SIG2'), 'expired');
  });

  it('needs a dollar wallet to convert', async () => {
    const { service } = setup();
    await expectApiError(
      service.quote('tolu', { from: 'NGN', to: 'USDC', amount: 15_000 }),
      'failed-precondition',
    );
  });

  it('stays pending until the payout confirms, then finishes once', async () => {
    const { service, wallet } = setup();
    wallet.next = 'pending';
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    expect((await service.execute('ada', quote.id)).status).toBe('pending');
    wallet.next = 'done';
    expect((await service.settle('ada', quote.id)).status).toBe('done');
    expect((await service.settle('ada', quote.id)).balances.NGN).toBe(
      MOCK_STARTING_BALANCE_KOBO - 1_500_000,
    );
  });

  it('runs a quote once even when asked twice', async () => {
    const { service, wallet } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    const first = await service.execute('ada', quote.id);
    const second = await service.execute('ada', quote.id);
    expect(second).toEqual(first);
    expect(wallet.payouts).toHaveLength(1);
  });

  it('gives the naira back if the payout fails to start', async () => {
    const { service, wallet } = setup();
    wallet.failSend = true;
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await expect(service.execute('ada', quote.id)).rejects.toThrow('circle down');
    expect((await service.balances('ada')).NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
  });

  it('refunds the naira if the payout fails afterwards', async () => {
    const { service, wallet } = setup();
    wallet.next = 'pending';
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await service.execute('ada', quote.id);
    wallet.next = 'failed';
    const result = await service.settle('ada', quote.id);
    expect(result.status).toBe('failed');
    expect(result.balances.NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
  });

  it('says so, and takes nothing, when Faara’s USDC float is too small', async () => {
    const { service, wallet } = setup();
    wallet.float = 500;
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await expectApiError(service.execute('ada', quote.id), 'failed-precondition');
    expect((await service.balances('ada')).NGN).toBe(MOCK_STARTING_BALANCE_KOBO);
    expect(wallet.payouts).toHaveLength(0);
  });

  it('refuses an expired quote to buy', async () => {
    const { service, advance } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    advance(QUOTE_TTL_MS + 1);
    await expectApiError(service.execute('ada', quote.id), 'expired');
  });

  it("won't run someone else's quote", async () => {
    const { service, wallets } = setup();
    wallets.set('tolu', 'ToluWa11et11111111111111111111111111111111');
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    await expectApiError(service.execute('tolu', quote.id), 'not-found');
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
      walletOf: async () => ADA_WALLET,
      paidOnChain: async () => false,
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
