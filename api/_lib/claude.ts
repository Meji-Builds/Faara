import Anthropic from '@anthropic-ai/sdk';

import { ApiError } from './errors';

/** Faara's assistant model. */
export const AI_MODEL = 'claude-opus-5-5';

export type AiContent = string | Anthropic.Beta.BetaContentBlockParam[];

/** One request that must come back as JSON matching `schema`. */
export interface AiJsonRequest {
  system: string;
  content: AiContent;
  /** JSON schema for the answer (structured outputs). */
  schema: Record<string, unknown>;
  /** How hard to think: `low` for quick parsing, higher for judgement calls. */
  effort: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

/** The part of Claude that Faara uses, so tests can stand in for it. */
export interface AiClient {
  readonly configured: boolean;
  json<T>(request: AiJsonRequest): Promise<T>;
}

/**
 * Claude through the Anthropic API. Answers are constrained to a JSON schema, and a
 * request declined by a safety classifier is retried server-side on Anthropic's
 * recommended fallback model (`fallbacks: "default"`).
 */
export function claudeClient(
  apiKey = process.env.ANTHROPIC_API_KEY,
  options: { fetch?: typeof fetch; maxRetries?: number } = {},
): AiClient {
  const client = apiKey
    ? new Anthropic({
        apiKey,
        timeout: 45_000,
        maxRetries: options.maxRetries ?? 1,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      })
    : null;
  return {
    configured: client !== null,

    async json<T>({ system, content, schema, effort, maxTokens = 4_000 }: AiJsonRequest) {
      if (!client) {
        throw new ApiError('failed-precondition', 'Faara’s assistant isn’t switched on yet.');
      }
      const send = (withFallback: boolean) =>
        client.beta.messages.create({
          model: AI_MODEL,
          max_tokens: maxTokens,
          ...(withFallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
          system,
          messages: [{ role: 'user', content }],
          output_config: { effort, format: { type: 'json_schema', schema } },
        });
      let response: Anthropic.Beta.BetaMessage;
      try {
        try {
          response = await send(true);
        } catch (error) {
          // An account without the fallback feature still gets an answer, just without it.
          if (error instanceof Anthropic.BadRequestError && /fallback|beta/i.test(error.message)) {
            console.warn('Claude fallbacks unavailable; retrying without them', error.message);
            response = await send(false);
          } else {
            throw error;
          }
        }
      } catch (error) {
        throw toApiError(error);
      }
      if (response.stop_reason === 'refusal') {
        throw new ApiError('failed-precondition', 'The assistant can’t help with that one.');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ApiError('internal', 'The assistant’s answer was cut short. Try again.');
      }
      const text = response.content.find(
        (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
      )?.text;
      if (!text) throw new ApiError('internal', 'The assistant didn’t answer. Try again.');
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ApiError('internal', 'The assistant’s answer couldn’t be read. Try again.');
      }
    },
  };
}

/**
 * Turns an Anthropic API failure into a message that says what to fix. These are about
 * Faara's own setup (key, credit, model access), never about the person's data.
 */
function toApiError(error: unknown): unknown {
  if (!(error instanceof Anthropic.APIError)) return error;
  console.error('Claude request failed', error.status, error.message);
  if (error instanceof Anthropic.RateLimitError) {
    return new ApiError('resource-exhausted', 'The assistant is busy. Try again in a minute.');
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ApiError(
      'failed-precondition',
      'The assistant isn’t set up correctly: its API key was refused.',
    );
  }
  if (
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError
  ) {
    return new ApiError(
      'failed-precondition',
      'The assistant’s account can’t use this AI model yet.',
    );
  }
  if (error instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(error.message)) {
    return new ApiError('failed-precondition', 'The assistant’s account is out of credit.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ApiError('internal', 'The assistant took too long to answer. Try again.');
  }
  return new ApiError('internal', 'The assistant isn’t reachable right now. Try again.');
}

/** A JSON schema object with every property required and nothing extra, as structured outputs expect. */
export function objectSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
