import { MOCK_STARTING_BALANCE_KOBO, RATE_LIMITS } from '../../../shared/hum';
import { QUOTE_TTL_MS, parseQuoteRequest, priceConversion } from '../../../shared/convert';
import { ApiError } from '../errors';
import { ConvertService, MockExchange } from '../convertService';
import { MockNairaLedger } from '../naira';
import { MemoryStore } from '../store';

const RATE = 1_500;

function setup() {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let ids = 0;
  const service = new ConvertService({
    store,
    now: () => clock,
    newId: () => `id${++ids}x${ids}abcdef`,
    exchange: new MockExchange(RATE, () => clock),
  });
  return { store, service, advance: (ms: number) => (clock += ms) };
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
  it('converts naira to dollars exactly as quoted', async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USD', amount: 15_000 });
    expect(quote.toMinor).toBe(990);
    const balances = await service.execute('ada', quote.id);
    expect(balances).toEqual({
      NGN: MOCK_STARTING_BALANCE_KOBO - 1_500_000,
      USD: 990,
      USDC: 0,
    });
  });

  it('runs a quote once even when asked twice', async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USDC', amount: 15_000 });
    const first = await service.execute('ada', quote.id);
    const second = await service.execute('ada', quote.id);
    expect(second).toEqual(first);
  });

  it('refuses an expired quote', async () => {
    const { service, advance } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USD', amount: 15_000 });
    advance(QUOTE_TTL_MS + 1);
    await expectApiError(service.execute('ada', quote.id), 'expired');
  });

  it("won't run someone else's quote", async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USD', amount: 15_000 });
    await expectApiError(service.execute('tolu', quote.id), 'not-found');
  });

  it('needs the balance to cover it', async () => {
    const { service } = setup();
    const quote = await service.quote('ada', { from: 'USD', to: 'NGN', amount: 50 });
    await expectApiError(service.execute('ada', quote.id), 'failed-precondition');
  });

  it('converts back and forth across all three currencies', async () => {
    const { service } = setup();
    let quote = await service.quote('ada', { from: 'NGN', to: 'USD', amount: 150_000 });
    await service.execute('ada', quote.id);
    quote = await service.quote('ada', { from: 'USD', to: 'USDC', amount: 50 });
    await service.execute('ada', quote.id);
    quote = await service.quote('ada', { from: 'USDC', to: 'NGN', amount: 20 });
    const balances = await service.execute('ada', quote.id);
    expect(balances.NGN).toBeGreaterThan(MOCK_STARTING_BALANCE_KOBO - 15_000_000);
    expect(balances.USD).toBe(9_900 - 5_000);
    expect(balances.USDC).toBe(4_987 - 2_000);
  });

  it('keeps dollar balances when naira moves on the ledger', async () => {
    const { store, service } = setup();
    const quote = await service.quote('ada', { from: 'NGN', to: 'USD', amount: 15_000 });
    await service.execute('ada', quote.id);
    const ledger = new MockNairaLedger(store, () => 1_000_000);
    await ledger.credit({ uid: 'ada', amountKobo: 100_000, reference: 'top1' });
    expect((await service.balances('ada')).USD).toBe(990);
  });

  it('limits how fast quotes can be requested', async () => {
    const { service } = setup();
    for (let i = 0; i < RATE_LIMITS.convert; i++) {
      await service.quote('ada', { from: 'NGN', to: 'USD', amount: 1_000 });
    }
    await expectApiError(
      service.quote('ada', { from: 'NGN', to: 'USD', amount: 1_000 }),
      'resource-exhausted',
    );
  });
});
