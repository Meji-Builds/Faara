import { createHmac } from 'node:crypto';

import { FundingService } from '../fundingService';
import { MockNairaLedger } from '../naira';
import { isValidPaystackSignature, type CheckoutProvider } from '../paystack';
import { MemoryStore } from '../store';

function setup(configured = true) {
  const store = new MemoryStore();
  store.docs.set('users/ada', { fullName: 'Ada Okafor', username: 'ada.ok' });
  const payments = new Map<
    string,
    { status: 'success' | 'pending' | 'failed'; amountKobo: number; currency: string }
  >();
  const notified: string[] = [];
  let ids = 0;
  const checkout: CheckoutProvider = {
    configured,
    initialize: async ({ reference }) => ({ checkoutUrl: `https://checkout.test/${reference}` }),
    verify: async (reference) =>
      payments.get(reference) ?? { status: 'pending', amountKobo: 0, currency: 'NGN' },
  };
  const service = new FundingService({
    store,
    now: () => 1_000,
    newId: () => `abcdefgh${++ids}`,
    naira: new MockNairaLedger(store, () => 1_000),
    checkout,
    notify: async (uid) => void notified.push(uid),
  });
  return { store, service, payments, notified };
}

describe('FundingService', () => {
  it('credits a confirmed top-up exactly once and records it', async () => {
    const { service, store, payments, notified } = setup();
    const { reference, checkoutUrl } = await service.initialize(
      'ada',
      5_000,
      'https://app/add-money',
    );
    expect(checkoutUrl).toContain(reference);
    await expect(service.confirm(reference, 'ada')).resolves.toEqual({
      status: 'pending',
      amount: 0,
    });

    payments.set(reference, { status: 'success', amountKobo: 500_000, currency: 'NGN' });
    await expect(service.confirm(reference, 'ada')).resolves.toEqual({
      status: 'success',
      amount: 5_000,
    });
    // The webhook confirming again must not credit twice.
    await expect(service.confirm(reference)).resolves.toEqual({ status: 'success', amount: 5_000 });

    expect(store.docs.get('ledgerAccounts/ada')).toMatchObject({
      balanceKobo: 20_000_000 + 500_000,
    });
    expect(store.docs.get(`users/ada/activity/${reference}`)).toMatchObject({
      kind: 'deposit',
      direction: 'in',
    });
    expect(notified).toEqual(['ada']);
  });

  it('refuses underpaid or foreign-currency payments, and other people’s references', async () => {
    const { service, store, payments } = setup();
    const { reference } = await service.initialize('ada', 5_000, 'https://app/add-money');
    payments.set(reference, { status: 'success', amountKobo: 100, currency: 'NGN' });
    await expect(service.confirm(reference, 'ada')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    payments.set(reference, { status: 'success', amountKobo: 500_000, currency: 'USD' });
    await expect(service.confirm(reference, 'ada')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await expect(service.confirm(reference, 'mallory')).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(store.docs.get('ledgerAccounts/ada')).toBeUndefined();
  });

  it('explains when the payment partner is not configured', async () => {
    const { service } = setup(false);
    await expect(service.initialize('ada', 5_000, 'https://app/add-money')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('Paystack webhook signature', () => {
  it('accepts only the HMAC-SHA512 of the raw body', () => {
    const body = '{"event":"charge.success"}';
    const good = createHmac('sha512', 'sk_test_x').update(body).digest('hex');
    expect(isValidPaystackSignature(body, good, 'sk_test_x')).toBe(true);
    expect(isValidPaystackSignature(body + ' ', good, 'sk_test_x')).toBe(false);
    expect(isValidPaystackSignature(body, 'nope', 'sk_test_x')).toBe(false);
    expect(isValidPaystackSignature(body, good, undefined)).toBe(false);
  });
});
