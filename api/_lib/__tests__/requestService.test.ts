import { ApiError } from '../errors';
import { HumService } from '../humService';
import { MockNairaLedger } from '../naira';
import { RequestService } from '../requestService';
import { MemoryStore } from '../store';

function setup() {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let ids = 0;
  const now = () => clock;
  const newId = () => `id${++ids}abcdefgh`;
  const naira = new MockNairaLedger(store, now);
  const notes: string[] = [];
  const requests = new RequestService({
    store,
    now,
    newId,
    notify: async (uid, message) => void notes.push(`${uid}: ${message.title}`),
  });
  const payments = new HumService({
    store,
    now,
    newId,
    naira,
    randomInt: () => 0,
    fetchTransaction: async () => null,
    walletRisk: async () => null,
  });
  for (const [uid, fullName, username] of [
    ['ada', 'Ada Okafor', 'ada.ok'],
    ['tolu', 'Tolu Adebayo', 'tolu.a'],
    ['kola', 'Kola Musa', 'kolamusa'],
  ] as const) {
    store.docs.set(`users/${uid}`, { fullName, username });
    store.docs.set(`usernames/${username}`, { uid });
  }
  /** Pays a request through the normal transfer flow, as the app does. */
  const pay = async (payer: string, id: string, amount = 5_000) => {
    const transfer = await payments.createTransfer(payer, {
      username: 'ada.ok',
      amount,
      currency: 'NGN',
      requestId: id,
    });
    return payments.settleHum(payer, { paymentId: transfer.paymentId });
  };
  return { store, requests, payments, naira, notes, pay, advance: (ms: number) => (clock += ms) };
}

async function expectApiError(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('payment requests', () => {
  it('asks one person, tells them, and shows in both lists', async () => {
    const { requests, notes } = setup();
    const created = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'Garri',
      fromUsername: 'tolu.a',
    });
    expect(created).toMatchObject({ status: 'open', from: { username: 'tolu.a' } });
    expect(notes).toEqual(['tolu: Ada Okafor requested ₦5,000']);
    expect((await requests.list('ada'))[0]).toMatchObject({ id: created.id, role: 'sent' });
    expect((await requests.list('tolu'))[0]).toMatchObject({ id: created.id, role: 'toPay' });
    expect(await requests.list('kola')).toEqual([]);
  });

  it('is paid through the normal payment and then shows as paid to both', async () => {
    const { requests, naira, pay } = setup();
    const { id } = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'Garri',
      fromUsername: 'tolu.a',
    });
    const before = await naira.balance('ada');
    await pay('tolu', id);
    expect(await naira.balance('ada')).toBe(before + 500_000);
    const seen = await requests.get('ada', id);
    expect(seen).toMatchObject({ status: 'paid', paidBy: { username: 'tolu.a' }, canPay: false });
    expect((await requests.list('tolu'))[0]?.status).toBe('paid');
  });

  it('lets anyone with the link pay an open request, once', async () => {
    const { requests, pay } = setup();
    const { id } = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'Dues',
      fromUsername: null,
    });
    expect((await requests.get('kola', id)).canPay).toBe(true);
    await pay('kola', id);
    await expectApiError(pay('tolu', id), 'failed-precondition');
    expect((await requests.list('kola'))[0]).toMatchObject({ role: 'toPay', status: 'paid' });
  });

  it('only the person asked can pay or see a directed request', async () => {
    const { requests, pay } = setup();
    const { id } = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'x',
      fromUsername: 'tolu.a',
    });
    await expectApiError(requests.get('kola', id), 'not-found');
    await expectApiError(pay('kola', id), 'not-found');
  });

  it('refuses a payment that doesn’t match the request', async () => {
    const { requests, pay } = setup();
    const { id } = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'x',
      fromUsername: null,
    });
    await expectApiError(pay('tolu', id, 4_000), 'invalid-argument');
  });

  it('can be cancelled while unpaid, and expires after 30 days', async () => {
    const { requests, pay, advance } = setup();
    const first = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'x',
      fromUsername: null,
    });
    await requests.cancel('ada', first.id);
    await expectApiError(pay('tolu', first.id), 'failed-precondition');
    await expectApiError(requests.cancel('tolu', first.id), 'not-found');

    const second = await requests.create('ada', {
      amountKobo: 500_000,
      note: 'y',
      fromUsername: null,
    });
    advance(31 * 86_400_000);
    expect((await requests.get('ada', second.id)).status).toBe('expired');
    await expectApiError(pay('tolu', second.id), 'failed-precondition');
  });

  it('won’t ask yourself or someone who isn’t on Faara', async () => {
    const { requests } = setup();
    await expectApiError(
      requests.create('ada', { amountKobo: 500_000, note: 'x', fromUsername: 'ada.ok' }),
      'invalid-argument',
    );
    await expectApiError(
      requests.create('ada', { amountKobo: 500_000, note: 'x', fromUsername: 'ghost' }),
      'not-found',
    );
  });
});
