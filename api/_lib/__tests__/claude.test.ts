import { claudeClient, objectSchema } from '../claude';
import { ApiError } from '../errors';

const request = {
  system: 'test',
  content: 'hi',
  schema: objectSchema({ ok: { type: 'boolean' } }),
  effort: 'low' as const,
};

const answer = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '{"ok":true}' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
};

/** A fetch that answers each call with the next canned response, and records request bodies. */
function fakeFetch(...replies: { status: number; body: object }[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply?.body), {
      status: reply?.status ?? 500,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, bodies };
}

const apiError = (status: number, message: string) => ({
  status,
  body: { type: 'error', error: { type: 'invalid_request_error', message } },
});

async function failsWith(fetch: typeof globalThis.fetch, message: RegExp) {
  const client = claudeClient('sk-test', { fetch, maxRetries: 0 });
  const promise = client.json(request);
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toThrow(message);
}

describe('claudeClient', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the parsed JSON answer, asking for fallbacks', async () => {
    const { fetch, bodies } = fakeFetch({ status: 200, body: answer });
    const client = claudeClient('sk-test', { fetch, maxRetries: 0 });
    expect(await client.json(request)).toEqual({ ok: true });
    expect(bodies[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
  });

  it('retries without fallbacks when the account doesn’t have them', async () => {
    const { fetch, bodies } = fakeFetch(
      apiError(400, 'fallbacks: Extra inputs are not permitted'),
      {
        status: 200,
        body: answer,
      },
    );
    const client = claudeClient('sk-test', { fetch, maxRetries: 0 });
    expect(await client.json(request)).toEqual({ ok: true });
    expect(bodies[1]).not.toHaveProperty('fallbacks');
  });

  it('says what to fix for setup problems', async () => {
    await failsWith(fakeFetch(apiError(401, 'invalid x-api-key')).fetch, /API key was refused/);
    await failsWith(
      fakeFetch(apiError(400, 'Your credit balance is too low to access the API.')).fetch,
      /out of credit/,
    );
    await failsWith(
      fakeFetch(apiError(404, 'model: claude-opus-5-5')).fetch,
      /can’t use this AI model/,
    );
  });

  it('is off without a key', async () => {
    await expect(claudeClient('').json(request)).rejects.toThrow(/isn’t switched on/);
  });
});
