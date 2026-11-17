import { errorResponse, getServices, json } from '../_lib/http';
import { isValidPaystackSignature } from '../_lib/paystack';

/**
 * POST /api/webhooks/paystack: Paystack calls this when a payment succeeds, so top-ups are
 * credited even if the payer never returns to the app. The signature proves it is Paystack;
 * the payment is then re-verified by reference before anything is credited.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    if (!isValidPaystackSignature(raw, request.headers.get('x-paystack-signature'))) {
      return json(401, { error: { code: 'unauthenticated', message: 'Bad signature.' } });
    }
    const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
    const reference = event.data?.reference;
    if (
      event.event === 'charge.success' &&
      typeof reference === 'string' &&
      reference.startsWith('FND')
    ) {
      await getServices().funding.confirm(reference);
    }
    return json(200, { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
