import { timingSafeEqual } from 'node:crypto';

import {
  parseConsentRequest,
  parseFeedbackRequest,
  parseIntentRequest,
  parsePaymentCheckRequest,
  parseRuleDraft,
  parseRuleId,
  parseScamCheckRequest,
} from '../../../shared/ai';
import { authedRoute, errorResponse, getServices, json } from '../http';

/** POST /api/ai/intent: understand a spoken or typed instruction; returns a draft to review. */
export const intent = authedRoute(parseIntentRequest, ({ uid, services }, request) =>
  services.assistant.intent(uid, request),
);

/** POST /api/ai/check: the scam guard's view of a payment about to be approved. */
export const check = authedRoute(parsePaymentCheckRequest, ({ uid, services }, request) =>
  services.assistant.checkPayment(uid, request),
);

/** POST /api/ai/scam: "Is this a scam?" for a pasted message or a screenshot. */
export const scam = authedRoute(parseScamCheckRequest, ({ uid, services }, request) =>
  services.assistant.scamCheck(uid, request),
);

/** POST /api/ai/draft: turn a sentence into a savings rule for the person to approve. */
export const draft = authedRoute(parseIntentRequest, ({ uid, services }, request) =>
  services.agent.draft(uid, request),
);

/** POST /api/ai/rules: the person's savings rules and what the agent has done. */
export const rules = authedRoute(
  () => ({}),
  ({ uid, services }) => services.agent.rules(uid),
);

/** POST /api/ai/save: save a rule the person approved. */
export const save = authedRoute(parseRuleDraft, ({ uid, services }, request) =>
  services.agent.save(uid, request),
);

/** POST /api/ai/remove: delete one of the person's rules. */
export const remove = authedRoute(parseRuleId, async ({ uid, services }, request) => {
  await services.agent.remove(uid, request.id);
  return { removed: request.id };
});

/** POST /api/ai/run: run the person's rules now (the app calls this when it opens). */
export const run = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ actions: await services.agent.runNow(uid) }),
  { movesMoney: true },
);

/**
 * POST /api/ai/consent: with `{ consent: true | false }`, records whether the person lets
 * Faara keep (anonymised) examples to improve its AI; saying no deletes what was kept.
 * Without it, returns the current choice (null if never asked).
 */
export const consent = authedRoute(parseConsentRequest, async ({ uid, services }, request) =>
  request.consent === null
    ? { consent: await services.aiData.consent(uid) }
    : services.aiData.setConsent(uid, request.consent),
);

/** POST /api/ai/feedback: thumbs up or down on an answer that was kept. */
export const feedback = authedRoute(parseFeedbackRequest, async ({ uid, services }, request) => {
  await services.aiData.feedback(uid, request.exampleId, request.good);
  return { ok: true };
});

/** True if the request carries `secret` as a bearer token or a `token` query parameter. */
function hasSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const query = new URL(request.url).searchParams.get('token') ?? '';
  const expected = Buffer.from(secret);
  return [header, query].some((given) => {
    const value = Buffer.from(given);
    return value.length === expected.length && timingSafeEqual(value, expected);
  });
}

/**
 * GET /api/ai/export?token=…&after=…: anonymised examples for training, oldest first,
 * 500 at a time. Closed unless AI_EXPORT_TOKEN is set; pass `next` back as `after`.
 */
export async function exportExamples(request: Request): Promise<Response> {
  try {
    if (!hasSecret(request, process.env.AI_EXPORT_TOKEN)) {
      return json(401, { error: { code: 'unauthenticated', message: 'Not allowed.' } });
    }
    const after = Number(new URL(request.url).searchParams.get('after') ?? 0);
    return json(200, await getServices().aiData.export(Number.isFinite(after) ? after : 0, 500));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/ai/cron: Vercel's daily schedule runs everyone's rules. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; without that secret set, the route is closed.
 */
export async function cron(request: Request): Promise<Response> {
  try {
    if (!hasSecret(request, process.env.CRON_SECRET)) {
      return json(401, { error: { code: 'unauthenticated', message: 'Not allowed.' } });
    }
    return json(200, await getServices().agent.runAll());
  } catch (error) {
    return errorResponse(error);
  }
}
