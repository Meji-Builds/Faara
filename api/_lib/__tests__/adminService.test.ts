import { AdminService } from '../adminService';
import { ApiError } from '../errors';
import { MemoryStore } from '../store';
import { SupportService } from '../supportService';

function setup() {
  const store = new MemoryStore();
  let clock = Date.UTC(2026, 10, 21, 12);
  let ids = 0;
  const now = () => clock;
  const newId = () => `id${++ids}abcdefgh`;
  const admin = new AdminService({ store, now, newId, admins: ['nifemi'] });
  const notes: string[] = [];
  const support = new SupportService({
    store,
    now,
    newId,
    admin,
    notify: async (uid, message) => void notes.push(`${uid}: ${message.title}`),
  });
  const person = (uid: string, fullName: string, username: string, phone: string) => {
    store.docs.set(`users/${uid}`, { fullName, username, phone, createdAt: clock });
    store.docs.set(`usernames/${username}`, { uid });
  };
  person('boss', 'Nifemi', 'nifemi', '+2348000000001');
  person('tolu', 'Tolu Adebayo', 'tolu.a', '+2348031234567');
  person('kola', 'Kola Musa', 'kolamusa', '+2348000000003');
  return { store, admin, support, notes, advance: (ms: number) => (clock += ms), now };
}

async function expectApiError(promise: Promise<unknown>, code: ApiError['code']) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('admin area', () => {
  it('is only for the team', async () => {
    const { admin } = setup();
    expect(await admin.isAdmin('boss')).toBe(true);
    expect(await admin.isAdmin('tolu')).toBe(false);
    await expectApiError(admin.overview('tolu'), 'permission-denied');
    await expectApiError(admin.searchUsers('tolu', ''), 'permission-denied');
    await expectApiError(admin.setPaused('tolu', 'kola', true, 'testing'), 'permission-denied');
  });

  it('finds people by username, phone in any format, or id', async () => {
    const { admin } = setup();
    for (const query of ['@tolu.a', '0803 123 4567', '8031234567', '+2348031234567']) {
      expect((await admin.searchUsers('boss', query)).map((u) => u.username)).toEqual(['tolu.a']);
    }
    expect(await admin.searchUsers('boss', 'nobody.here')).toEqual([]);
    expect((await admin.searchUsers('boss', '')).length).toBe(3);
  });

  it('pauses and unpauses an account, and logs who did it', async () => {
    const { admin, advance } = setup();
    await admin.setPaused('boss', 'tolu', true, 'Reported for fraud, checking.');
    expect(await admin.isPaused('tolu')).toBe(true);
    const detail = await admin.userDetail('boss', 'tolu');
    expect(detail.paused).toMatchObject({ reason: 'Reported for fraud, checking.', by: 'nifemi' });
    advance(1_000);
    await admin.setPaused('boss', 'tolu', false, '');
    expect(await admin.isPaused('tolu')).toBe(false);
    const log = await admin.log('boss');
    expect(log.map((entry) => `${entry.admin} ${entry.action} ${entry.target}`)).toEqual([
      'nifemi Unpaused account tolu.a',
      'nifemi Paused account tolu.a',
    ]);
  });

  it('counts today’s payments and open work on the overview', async () => {
    const { admin, store, support, now } = setup();
    store.docs.set('hums/p1', {
      senderName: 'Tolu',
      senderUsername: 'tolu.a',
      amountMinor: 500_000,
      currency: 'NGN',
      note: 'Garri',
      status: 'settled',
      settledAt: now(),
      chosenClaimId: 'kola',
    });
    store.docs.set('hums/p1/claims/kola', {
      fullName: 'Kola Musa',
      username: 'kolamusa',
      channel: 'sound',
    });
    store.docs.set('hums/old', {
      senderName: 'Tolu',
      senderUsername: 'tolu.a',
      amountMinor: 900_000,
      currency: 'NGN',
      note: '',
      status: 'settled',
      settledAt: now() - 3 * 86_400_000,
      chosenClaimId: null,
    });
    await support.create('tolu', {
      category: 'payment',
      message: 'My money did not arrive',
      paymentId: 'p1',
    });
    const overview = await admin.overview('boss');
    expect(overview).toMatchObject({
      users: 3,
      paymentsToday: { count: 1, nairaKobo: 500_000 },
      openTickets: 1,
    });
    const payments = await admin.payments('boss');
    expect(payments[0]).toMatchObject({ paymentId: 'p1', to: { username: 'kolamusa' } });
  });
});

describe('support tickets', () => {
  it('a ticket reaches the team, and replies go back and forth', async () => {
    const { support, notes } = setup();
    const ticket = await support.create('tolu', {
      category: 'payment',
      message: 'My money did not arrive\nI paid Kola 5k',
      paymentId: null,
    });
    expect(ticket).toMatchObject({ status: 'open', subject: 'My money did not arrive' });
    expect(notes).toEqual(['boss: New ticket: A payment went wrong']);

    await support.reply('boss', ticket.id, 'We’re checking it now.');
    expect((await support.mine('tolu'))[0]?.status).toBe('answered');
    expect(notes).toContain('tolu: Faara support replied');

    await support.reply('tolu', ticket.id, 'Thank you, still waiting.');
    const thread = await support.thread('boss', ticket.id);
    expect(thread.ticket.status).toBe('open');
    expect(thread.messages.map((m) => m.from)).toEqual(['user', 'faara', 'user']);
    expect(thread.messages[1]?.authorName).toBe('Faara support');
  });

  it('keeps tickets private to their owner and the team', async () => {
    const { support } = setup();
    const ticket = await support.create('tolu', {
      category: 'other',
      message: 'Hello support',
      paymentId: null,
    });
    await expectApiError(support.thread('kola', ticket.id), 'not-found');
    await expectApiError(support.reply('kola', ticket.id, 'Not mine'), 'not-found');
    await expectApiError(support.queue('kola'), 'permission-denied');
    await expectApiError(support.setStatus('tolu', ticket.id, 'closed'), 'permission-denied');
  });

  it('the team’s queue shows open tickets first', async () => {
    const { support, advance } = setup();
    const first = await support.create('tolu', {
      category: 'other',
      message: 'First problem',
      paymentId: null,
    });
    advance(1_000);
    await support.create('kola', { category: 'other', message: 'Second problem', paymentId: null });
    await support.setStatus('boss', first.id, 'closed');
    const queue = await support.queue('boss');
    expect(queue.map((t) => t.status)).toEqual(['open', 'closed']);
  });
});
