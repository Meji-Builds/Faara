import { timingSafeEqual } from 'node:crypto';

import {
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
);

/**
 * GET /api/ai/cron: Vercel's daily schedule runs everyone's rules. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; without that secret set, the route is closed.
 */
export async function cron(request: Request): Promise<Response> {
  try {
    const secret = process.env.CRON_SECRET;
    const given = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret ?? ''}`;
    const allowed =
      Boolean(secret) &&
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!allowed) {
      return json(401, { error: { code: 'unauthenticated', message: 'Not allowed.' } });
    }
    return json(200, await getServices().agent.runAll());
  } catch (error) {
    return errorResponse(error);
  }
}
