import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '../../../shared/hum';
import { parseDecision, parseOpenDispute } from '../../../shared/disputes';
import { AdminService } from '../adminService';
import { DisputeService } from '../disputeService';
import { ApiError } from '../errors';
import { MemoryStore } from '../store';
import { SupportService } from '../supportService';

const DAY = 86_400_000;

function setup() {
  const store = new MemoryStore();
  let clock = 10 * DAY;
  let ids = 0;
  const newId = () => `id${++ids}abcdef`;
  const now = () => clock;
  const admin = new AdminService({ store, now, newId, admins: ['nifemi', 'richard'] });
  const support = new SupportService({ store, now, newId, admin });
  const notes: string[] = [];
  const disputes = new DisputeService({
    store,
    now,
    admin,
    support,
    notify: async (uid, message) => void notes.push(`${uid}: ${message.title}`),
  });
  const person = (uid: string, fullName: string, username: string) => {
    store.docs.set(`users/${uid}`, { fullName, username });
    store.docs.set(`usernames/${username}`, { uid });
  };
  person('ada', 'Ada Okafor', 'ada.ok');
  person('tolu', 'Tolu Adebayo', 'tolu.a');
  person('boss', 'Nifemi', 'nifemi');
  person('rich', 'Richard', 'richard');
  /** A payment Ada made to Tolu, already settled on both sides of the ledger. */
  const paid = (paymentId: string, kobo: number, currency: 'NGN' | 'USDC' = 'NGN') => {
    const entry: ActivityEntry = {
      direction: 'out',
      kind: 'hum',
      paymentId,
      counterpartyName: 'Tolu Adebayo',
      counterpartyUsername: 'tolu.a',
      amountMinor: kobo,
      currency,
      note: '',
      createdAt: clock,
      signature: null,
    };
    store.docs.set(`users/ada/activity/${paymentId}`, entry);
  };
  const balance = (uid: string) =>
    store.docs.get(`ledgerAccounts/${uid}`) as
      { balanceKobo: number; heldKobo?: number } | undefined;
  return { store, disputes, paid, balance, notes, advance: (ms: number) => (clock += ms) };
}

const open = {
  reason: 'wrong-person' as const,
  details: 'I paid the person next to me by mistake.',
};

async function expectApiError(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('opening a dispute', () => {
  it('holds the naira in the recipient’s account and opens a support thread', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    const dispute = await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    expect(dispute).toMatchObject({ status: 'open', heldKobo: 500_000, amountMinor: 500_000 });
    expect(dispute.ticketId).toBeTruthy();
    expect(s.balance('tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO - 500_000,
      heldKobo: 500_000,
    });
    // The recipient and the team are told.
    expect(s.notes.some((n) => n.startsWith('tolu:'))).toBe(true);
    expect(s.notes.filter((n) => n.includes('New payment dispute'))).toHaveLength(2);
  });

  it('only lets the payer dispute, once, within 30 days', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    await expectApiError(s.disputes.open('tolu', { paymentId: 'PAY1', ...open }), 'not-found');
    await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    await expectApiError(
      s.disputes.open('ada', { paymentId: 'PAY1', ...open }),
      'failed-precondition',
    );
    s.paid('OLD', 1_000);
    s.advance(31 * DAY);
    await expectApiError(
      s.disputes.open('ada', { paymentId: 'OLD', ...open }),
      'failed-precondition',
    );
  });

  it('lets both people involved see it, and nobody else', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    expect(await s.disputes.get('ada', 'PAY1')).not.toBeNull();
    expect(await s.disputes.get('tolu', 'PAY1')).not.toBeNull();
    expect(await s.disputes.get('boss', 'PAY1')).not.toBeNull();
    s.store.docs.set('users/kola', { fullName: 'Kola', username: 'kola' });
    expect(await s.disputes.get('kola', 'PAY1')).toBeNull();
  });
});

describe('deciding a dispute', () => {
  it('refunds the payer from the hold and records it for both people', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    const decided = await s.disputes.decide('boss', {
      paymentId: 'PAY1',
      action: 'refund',
      note: 'Paid the wrong person nearby.',
    });
    expect(decided).toMatchObject({ status: 'refunded', heldKobo: 0 });
    expect(decided.decision?.refundedKobo).toBe(500_000);
    expect(s.balance('ada')?.balanceKobo).toBe(MOCK_STARTING_BALANCE_KOBO + 500_000);
    expect(s.balance('tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO - 500_000,
      heldKobo: 0,
    });
    expect(s.store.docs.get('users/ada/activity/RFPAY1')).toMatchObject({
      kind: 'refund',
      direction: 'in',
    });
    expect(s.store.docs.get('users/tolu/activity/RFPAY1')).toMatchObject({ direction: 'out' });
    await expectApiError(
      s.disputes.decide('boss', { paymentId: 'PAY1', action: 'reject', note: 'Again?' }),
      'failed-precondition',
    );
  });

  it('releases the hold when rejected', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    await s.disputes.decide('boss', {
      paymentId: 'PAY1',
      action: 'reject',
      note: 'Goods were delivered.',
    });
    expect(s.balance('tolu')).toMatchObject({
      balanceKobo: MOCK_STARTING_BALANCE_KOBO,
      heldKobo: 0,
    });
    expect(s.balance('ada')).toBeUndefined();
  });

  it('needs two different admins to refund ₦50,000 or more', async () => {
    const s = setup();
    s.paid('BIG', 6_000_000);
    await s.disputes.open('ada', { paymentId: 'BIG', ...open });
    const first = await s.disputes.decide('boss', {
      paymentId: 'BIG',
      action: 'refund',
      note: 'Clear mistake.',
    });
    expect(first.status).toBe('open');
    // The same admin approving again doesn't count twice.
    expect(
      (await s.disputes.decide('boss', { paymentId: 'BIG', action: 'refund', note: 'Again.' }))
        .status,
    ).toBe('open');
    const second = await s.disputes.decide('rich', {
      paymentId: 'BIG',
      action: 'refund',
      note: 'Agreed.',
    });
    expect(second.status).toBe('refunded');
    expect(second.decision?.refundedKobo).toBe(6_000_000);
  });

  it('refunds only what the recipient still has if they spent some first', async () => {
    const s = setup();
    s.store.docs.set('ledgerAccounts/tolu', { balanceKobo: 200_000, updatedAt: 0 });
    s.paid('PAY1', 500_000);
    const dispute = await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    expect(dispute.heldKobo).toBe(200_000);
    const decided = await s.disputes.decide('boss', {
      paymentId: 'PAY1',
      action: 'refund',
      note: 'Refund what is left.',
    });
    expect(decided.decision?.refundedKobo).toBe(200_000);
    expect(s.balance('tolu')).toMatchObject({ balanceKobo: 0, heldKobo: 0 });
  });

  it('can’t refund dollars, and only admins outside the dispute can decide', async () => {
    const s = setup();
    s.paid('USD1', 500, 'USDC');
    const dispute = await s.disputes.open('ada', { paymentId: 'USD1', ...open });
    expect(dispute.heldKobo).toBe(0);
    await expectApiError(
      s.disputes.decide('boss', { paymentId: 'USD1', action: 'refund', note: 'Please refund.' }),
      'failed-precondition',
    );
    await expectApiError(
      s.disputes.decide('ada', { paymentId: 'USD1', action: 'reject', note: 'Not an admin.' }),
      'permission-denied',
    );
    expect(
      (
        await s.disputes.decide('boss', {
          paymentId: 'USD1',
          action: 'reject',
          note: 'Recipient sent it back.',
        })
      ).status,
    ).toBe('rejected');
  });

  it('lists disputes for admins only', async () => {
    const s = setup();
    s.paid('PAY1', 500_000);
    await s.disputes.open('ada', { paymentId: 'PAY1', ...open });
    expect(await s.disputes.list('boss')).toHaveLength(1);
    await expectApiError(s.disputes.list('ada'), 'permission-denied');
  });
});

describe('dispute requests', () => {
  it('need a reason, some detail, and a note for decisions', () => {
    expect(() =>
      parseOpenDispute({ paymentId: 'PAY1', reason: 'nope', details: 'x'.repeat(20) }),
    ).toThrow();
    expect(() =>
      parseOpenDispute({ paymentId: 'PAY1', reason: 'fraud', details: 'short' }),
    ).toThrow();
    expect(
      parseOpenDispute({ paymentId: 'PAY1', reason: 'fraud', details: 'They faked an alert.' })
        .reason,
    ).toBe('fraud');
    expect(() => parseDecision({ paymentId: 'PAY1', action: 'refund', note: '' })).toThrow();
    expect(() => parseDecision({ paymentId: 'PAY1', action: 'maybe', note: 'Because.' })).toThrow();
  });
});
