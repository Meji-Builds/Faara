import type { AiClient } from '../claude';
import { AiData } from '../aiData';
import { AssistantService } from '../assistantService';
import { ApiError } from '../errors';
import { MemoryStore } from '../store';

function setup() {
  const store = new MemoryStore();
  let clock = 1_000;
  let ids = 0;
  const data = new AiData({ store, now: () => clock++, newId: () => `id${++ids}abcdefgh` });
  const ai: AiClient = {
    configured: true,
    json: async <T>() =>
      ({
        action: 'send',
        recipientUsername: 'tolu.a',
        amountNaira: 5000,
        amountUsdc: 0,
        note: 'for Tolu',
        language: 'en',
        reply: 'Okay',
      }) as T,
  };
  const assistant = new AssistantService({ store, now: () => clock, ai, examples: data });
  store.docs.set('users/ada/activity/p1', {
    direction: 'out',
    kind: 'transfer',
    paymentId: 'p1',
    counterpartyName: 'Tolu Adebayo',
    counterpartyUsername: 'tolu.a',
    amountMinor: 100,
    currency: 'NGN',
    note: '',
    createdAt: 1,
    signature: null,
  });
  const examples = () =>
    [...store.docs].filter(([path]) => path.startsWith('aiExamples/')).map(([, doc]) => doc);
  return { store, data, assistant, examples };
}

describe('AI examples', () => {
  it('keeps nothing until the person agrees', async () => {
    const { data, assistant, examples } = setup();
    expect(await data.consent('ada')).toBeNull();
    const result = await assistant.intent('ada', { text: 'Send Tolu 5k', language: 'en' });
    expect(result.exampleId).toBeNull();
    expect(examples()).toHaveLength(0);
  });

  it('keeps redacted examples without the person’s id once they agree', async () => {
    const { data, assistant, examples } = setup();
    await data.setConsent('ada', true);
    const result = await assistant.intent('ada', {
      text: 'Send Tolu 5k, my number is 08031234567',
      language: 'en',
    });
    expect(result.exampleId).toMatch(/^EX/);
    const [kept] = examples() as Record<string, unknown>[];
    expect(kept?.input).toBe('Send [NAME] 5k, my number is [NUMBER]');
    expect(kept?.output).toMatchObject({ note: 'for [NAME]', matchedRecipient: true });
    expect(JSON.stringify(kept)).not.toContain('ada');
    expect(JSON.stringify(kept)).not.toContain('tolu');
  });

  it('takes feedback only from the person who gave the example', async () => {
    const { data, assistant, examples } = setup();
    await data.setConsent('ada', true);
    const { exampleId } = await assistant.intent('ada', { text: 'Send Tolu 5k', language: 'en' });
    await data.feedback('ada', exampleId ?? '', false);
    expect((examples()[0] as { feedback: string }).feedback).toBe('bad');
    await expect(data.feedback('tolu', exampleId ?? '', true)).rejects.toBeInstanceOf(ApiError);
  });

  it('deletes everything the person gave when they say no', async () => {
    const { data, assistant, examples } = setup();
    await data.setConsent('ada', true);
    await assistant.intent('ada', { text: 'Send Tolu 5k', language: 'en' });
    await assistant.intent('ada', { text: 'Send Tolu 2k', language: 'en' });
    expect((await data.setConsent('ada', false)).deleted).toBe(2);
    expect(examples()).toHaveLength(0);
    expect(await data.consent('ada')).toBe(false);
  });

  it('exports oldest first in pages, without owners', async () => {
    const { data, assistant } = setup();
    await data.setConsent('ada', true);
    for (let i = 0; i < 3; i++) {
      await assistant.intent('ada', { text: `Send Tolu ${i}k`, language: 'en' });
    }
    const first = await data.export(0, 2);
    expect(first.examples).toHaveLength(2);
    expect(first.next).not.toBeNull();
    expect(JSON.stringify(first.examples)).not.toContain('owner');
    const second = await data.export(first.next ?? 0, 2);
    expect(second.examples).toHaveLength(1);
    expect(second.next).toBeNull();
  });
});
