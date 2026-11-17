import type {
  ActivityEntry,
  InitializeFundingResponse,
  VerifyFundingResponse,
} from '../../shared/hum';

import { ApiError } from './errors';
import type { NairaProvider } from './naira';
import type { CheckoutProvider } from './paystack';
import type { DocumentStore } from './store';

interface IntentDoc {
  uid: string;
  amountKobo: number;
  status: 'pending' | 'success' | 'failed';
  createdAt: number;
  settledAt: number | null;
}

export interface FundingDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  naira: NairaProvider;
  checkout: CheckoutProvider;
  notify?: (
    uid: string,
    message: { title: string; body: string; data: Record<string, string> },
  ) => Promise<void>;
}

const intentPath = (reference: string) => `fundingIntents/${reference}`;
const activityPath = (uid: string, reference: string) => `users/${uid}/activity/${reference}`;

/**
 * Naira top-ups. We record our own intent (who and how much) before sending the payer to
 * checkout, and only credit what that intent says once the provider confirms payment, so a
 * forged callback or a mismatched amount can't credit anyone.
 */
export class FundingService {
  constructor(private readonly deps: FundingDeps) {}

  async initialize(
    uid: string,
    amountNaira: number,
    callbackUrl: string,
  ): Promise<InitializeFundingResponse> {
    const { store, now, newId, checkout } = this.deps;
    if (!checkout.configured) {
      throw new ApiError(
        'failed-precondition',
        'Adding money isn’t set up yet (payment partner key missing).',
      );
    }
    const reference = `FND${newId()}`;
    const amountKobo = amountNaira * 100;
    await store.transaction(async (tx) => {
      if (!(await tx.get(`users/${uid}`))) {
        throw new ApiError('failed-precondition', 'Finish creating your account first.');
      }
      tx.set(intentPath(reference), {
        uid,
        amountKobo,
        status: 'pending',
        createdAt: now(),
        settledAt: null,
      } satisfies IntentDoc);
    });
    const { checkoutUrl } = await checkout.initialize({
      email: `${uid.toLowerCase()}@users.faara.app`,
      amountKobo,
      reference,
      callbackUrl,
    });
    return { reference, checkoutUrl };
  }

  /**
   * Confirms a top-up with the provider and credits it once. `uid` is given when the app
   * asks (it may only confirm its own); the provider's webhook confirms by reference alone.
   */
  async confirm(reference: string, uid?: string): Promise<VerifyFundingResponse> {
    const { store, now, naira, checkout, notify } = this.deps;
    const intent = await store.transaction((tx) => tx.get<IntentDoc>(intentPath(reference)));
    if (!intent || (uid !== undefined && intent.uid !== uid)) {
      throw new ApiError('not-found', 'Top-up not found.');
    }
    const amount = intent.amountKobo / 100;
    if (intent.status === 'success') return { status: 'success', amount };

    const payment = await checkout.verify(reference);
    if (payment.status !== 'success') return { status: payment.status, amount: 0 };
    if (payment.currency !== 'NGN' || payment.amountKobo < intent.amountKobo) {
      throw new ApiError('failed-precondition', 'The payment didn’t match this top-up.');
    }

    // Idempotent on the reference, so the webhook and the app can both confirm safely.
    await naira.credit({ uid: intent.uid, amountKobo: intent.amountKobo, reference });
    const first = await store.transaction(async (tx) => {
      const current = await tx.get<IntentDoc>(intentPath(reference));
      if (!current || current.status === 'success') return false;
      const settledAt = now();
      tx.update(intentPath(reference), { status: 'success', settledAt });
      tx.set(activityPath(intent.uid, reference), {
        direction: 'in',
        kind: 'deposit',
        paymentId: reference,
        counterpartyName: 'Card or bank transfer',
        counterpartyUsername: '',
        amountMinor: intent.amountKobo,
        currency: 'NGN',
        note: 'Added money',
        createdAt: settledAt,
        signature: null,
      } satisfies ActivityEntry);
      return true;
    });
    if (first && notify) {
      await notify(intent.uid, {
        title: `₦${amount.toLocaleString('en-NG')} added to your balance`,
        body: 'Your top-up has arrived.',
        data: { paymentId: reference },
      }).catch(() => undefined);
    }
    return { status: 'success', amount };
  }
}
