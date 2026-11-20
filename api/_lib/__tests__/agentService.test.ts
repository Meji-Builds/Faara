import { nextRunAt, parseRuleDraft, type RuleDraft } from '../../../shared/ai';
import type { AiClient } from '../claude';
import { AgentService } from '../agentService';
import { ApiError } from '../errors';
import { MemoryStore } from '../store';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Friday 6 March 2026, 12:00 in Lagos (11:00 UTC).
const FRIDAY_NOON = Date.UTC(2026, 2, 6, 11);

function setup(answer: object = {}, buyStatus: 'done' | 'failed' = 'done') {
  const store = new MemoryStore();
  let clock = FRIDAY_NOON;
  let ids = 0;
  const bought: number[] = [];
  const ai: AiClient = { configured: true, json: async <T>() => answer as T };
  const notes: string[] = [];
  const service = new AgentService({
    store,
    now: () => clock,
    newId: () => `id${++ids}abcdef`,
    ai,
    buyUsdc: async (_uid, kobo) => {
      bought.push(kobo);
      return { status: buyStatus };
    },
    notify: async (_uid, message) => void notes.push(message.title),
  });
  let n = 0;
  const receive = (kobo: number) => {
    n++;
    store.docs.set(`users/ada/activity/in${n}`, {
      direction: 'in',
      kind: 'transfer',
      paymentId: `in${n}`,
      counterpartyName: 'Tolu',
      counterpartyUsername: 'tolu.a',
      amountMinor: kobo,
      currency: 'NGN',
      note: '',
      createdAt: clock,
      signature: null,
    });
  };
  return { store, service, bought, notes, receive, advance: (ms: number) => (clock += ms) };
}

const percent: RuleDraft = {
  kind: 'save_percent',
  percent: 30,
  summary: 'Save 30% of what I get.',
};
const friday: RuleDraft = {
  kind: 'save_fixed',
  amountKobo: 200_000,
  frequency: 'weekly',
  weekday: 5,
  dayOfMonth: 1,
  summary: 'Save ₦2,000 every Friday.',
};

describe('scheduling', () => {
  it('runs at 9am Lagos time on the right day', () => {
    const next = nextRunAt({ frequency: 'weekly', weekday: 5, dayOfMonth: 1 }, FRIDAY_NOON);
    expect(new Date(next).toISOString()).toBe('2026-03-13T08:00:00.000Z'); // next Friday, 09:00 WAT
    const daily = nextRunAt({ frequency: 'daily', weekday: 0, dayOfMonth: 1 }, FRIDAY_NOON);
    expect(new Date(daily).toISOString()).toBe('2026-03-07T08:00:00.000Z');
    const monthly = nextRunAt({ frequency: 'monthly', weekday: 0, dayOfMonth: 1 }, FRIDAY_NOON);
    expect(new Date(monthly).toISOString()).toBe('2026-04-01T08:00:00.000Z');
  });

  it('validates drafts sent back from the phone', () => {
    expect(parseRuleDraft(friday)).toEqual(friday);
    expect(() => parseRuleDraft({ ...percent, percent: 95 })).toThrow();
    expect(() => parseRuleDraft({ ...friday, amountKobo: 50 })).toThrow();
    expect(() => parseRuleDraft({ ...friday, weekday: 9 })).toThrow();
    expect(() => parseRuleDraft({ kind: 'invest_in_stocks', summary: 'x' })).toThrow();
  });
});

describe('AgentService', () => {
  it('saves a share of new income, once', async () => {
    const { service, bought, receive, advance } = setup();
    await service.save('ada', percent);
    advance(HOUR);
    receive(1_000_000); // ₦10,000
    receive(500_000); // ₦5,000
    const log = await service.run('ada');
    expect(bought).toEqual([450_000]); // 30% of ₦15,000
    expect(log[0]?.status).toBe('done');
    expect(await service.run('ada')).toEqual([]);
    expect(bought).toHaveLength(1);
  });

  it('carries small amounts forward until they reach ₦100', async () => {
    const { service, bought, receive, advance } = setup();
    await service.save('ada', percent);
    advance(HOUR);
    receive(20_000); // 30% = ₦60
    await service.run('ada');
    expect(bought).toEqual([]);
    advance(HOUR);
    receive(20_000); // ₦60 more: ₦120 owed
    await service.run('ada');
    expect(bought).toEqual([12_000]);
  });

  it('ignores income from before the rule existed', async () => {
    const { service, bought, receive, advance } = setup();
    receive(1_000_000);
    advance(HOUR);
    await service.save('ada', percent);
    await service.run('ada');
    expect(bought).toEqual([]);
  });

  it('runs a weekly rule when it falls due, then waits a week', async () => {
    const { service, bought, advance } = setup();
    await service.save('ada', friday);
    await service.run('ada');
    expect(bought).toEqual([]);
    advance(7 * DAY);
    await service.run('ada');
    expect(bought).toEqual([200_000]);
    advance(DAY);
    await service.run('ada');
    expect(bought).toHaveLength(1);
  });

  it('two runs at the same time never save twice', async () => {
    const { service, bought, receive, advance } = setup();
    await service.save('ada', percent);
    advance(HOUR);
    receive(1_000_000);
    await Promise.all([service.run('ada'), service.run('ada'), service.run('ada')]);
    expect(bought).toEqual([300_000]);
  });

  it('records a skipped run and tells the person', async () => {
    const { service, notes, advance } = setup({}, 'failed');
    await service.save('ada', friday);
    advance(7 * DAY);
    const [entry] = await service.run('ada');
    expect(entry?.status).toBe('skipped');
    expect(notes[0]).toContain('Couldn’t save');
    expect((await service.rules('ada')).log).toHaveLength(1);
  });

  it('allows five rules and removes them by id', async () => {
    const { service } = setup();
    const first = await service.save('ada', friday);
    for (let i = 0; i < 4; i++) await service.save('ada', percent);
    await expect(service.save('ada', percent)).rejects.toBeInstanceOf(ApiError);
    await service.remove('ada', first.id);
    expect((await service.rules('ada')).rules).toHaveLength(4);
  });

  it('turns a sentence into a draft, or asks a question', async () => {
    const good = setup({
      kind: 'save_fixed',
      percent: 0,
      amountNaira: 2000,
      frequency: 'weekly',
      weekday: 5,
      dayOfMonth: 0,
      summary: 'Every Friday at 9am, move ₦2,000 into dollars.',
      question: '',
    });
    const { draft } = await good.service.draft('ada', {
      text: 'save 2k every friday',
      language: 'pcm',
    });
    expect(draft).toMatchObject({ kind: 'save_fixed', amountKobo: 200_000, weekday: 5 });

    const odd = setup({
      kind: 'unsupported',
      percent: 0,
      amountNaira: 0,
      frequency: 'none',
      weekday: 0,
      dayOfMonth: 0,
      summary: '',
      question: 'I can only save into dollars for now.',
    });
    const result = await odd.service.draft('ada', { text: 'buy me stocks', language: 'en' });
    expect(result).toEqual({ draft: null, question: 'I can only save into dollars for now.' });
  });
});
