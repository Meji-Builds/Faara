import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paystack hosted checkout (card, bank transfer, USSD). Configure PAYSTACK_SECRET_KEY in
 * Vercel; use a test key (sk_test_…) until launch. Only this file knows about Paystack.
 */
const BASE_URL = 'https://api.paystack.co';

export interface CheckoutProvider {
  readonly configured: boolean;
  /** Starts a checkout and returns the URL to send the payer to. */
  initialize(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  /** Looks up a payment by reference. */
  verify(
    reference: string,
  ): Promise<{ status: 'success' | 'pending' | 'failed'; amountKobo: number; currency: string }>;
}

async function call<T>(secret: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  });
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!response.ok || !body?.status || !body.data) {
    throw new Error(`Paystack: ${body?.message ?? `HTTP ${response.status}`}`);
  }
  return body.data;
}

export function paystackCheckout(secret = process.env.PAYSTACK_SECRET_KEY): CheckoutProvider {
  return {
    configured: Boolean(secret),

    async initialize({ email, amountKobo, reference, callbackUrl }) {
      if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
      const data = await call<{ authorization_url: string }>(secret, '/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          channels: ['card', 'bank_transfer', 'ussd', 'bank'],
        }),
      });
      return { checkoutUrl: data.authorization_url };
    },

    async verify(reference) {
      if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
      const data = await call<{ status: string; amount: number; currency: string }>(
        secret,
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );
      const status =
        data.status === 'success'
          ? 'success'
          : data.status === 'failed' || data.status === 'abandoned'
            ? 'failed'
            : 'pending';
      return { status, amountKobo: data.amount, currency: data.currency };
    },
  };
}

/** Checks a webhook's `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key). */
export function isValidPaystackSignature(
  rawBody: string,
  signature: string | null,
  secret = process.env.PAYSTACK_SECRET_KEY,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
