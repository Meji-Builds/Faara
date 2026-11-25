import { MOCK_STARTING_BALANCE_KOBO, type ApiErrorCode } from '../../shared/hum';
import {
  QUOTE_TTL_MS,
  priceConversion,
  type Balances,
  type ConvertCurrency,
  type MidRates,
  type Quote,
  type QuoteRequest,
} from '../../shared/convert';

import { ApiError } from './errors';
import { consumeRate } from './rateLimit';
import type { DocumentStore } from './store';

/** Source of mid-market rates. Swap for the exchange partner's live rates. */
export interface ExchangeProvider {
  readonly name: string;
  rates(): Promise<MidRates>;
}

/** Fixed rate for development and tests. Never use with real money. */
export class MockExchange implements ExchangeProvider {
  readonly name = 'mock';
  constructor(
    private readonly ngnPerUsd: number,
    private readonly now: () => number,
  ) {}
  async rates(): Promise<MidRates> {
    return { ngnPerUsd: this.ngnPerUsd, asOf: this.now() };
  }
}

/** Faara's own USDC float (implemented by Circle), which conversions are paid from and into. */
export interface UsdcRail {
  /** USDC in the float, in cents. */
  floatCents(): Promise<number>;
  /** The float's Solana address, where people send USDC they're selling. */
  floatAddress(): Promise<string>;
  /** Pays USDC from the float to an address. The key makes retries safe. Returns an id. */
  payout(address: string, cents: number, key: string): Promise<string>;
  transferState(id: string): Promise<'pending' | 'done' | 'failed'>;
}

/** How long after a quote expires a USDC payment made for it is still honoured. */
const LATE_PAYMENT_MS = 10 * 60_000;

export type ConversionStatus = 'pending' | 'done' | 'failed';

export interface ConversionResult {
  id: string;
  status: ConversionStatus;
  balances: Balances;
}

interface ConversionDoc {
  from: ConvertCurrency;
  to: ConvertCurrency;
  fromMinor: number;
  toMinor: number;
  status: ConversionStatus;
  transferId?: string;
  /** The person's own USDC payment into the float, when selling. */
  signature?: string;
}

interface AccountDoc {
  balanceKobo: number;
  balanceUsdCents?: number;
  balanceUsdcCents?: number;
  updatedAt: number;
}

interface QuoteDoc extends Omit<Quote, 'id'> {
  uid: string;
  status: 'open' | 'used';
  createdAt: number;
}

export interface ConvertDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  exchange: ExchangeProvider;
  /** Present once USDC wallets are set up; naira-USDC conversions need it. */
  usdc?: UsdcRail | undefined;
  /** The person's own dollar wallet address (on their profile), if they have one. */
  walletOf: (uid: string) => Promise<string | null>;
  /** Gets a wallet ready to receive USDC (creates its USDC account if it's new). */
  prepareWallet?: (address: string) => Promise<void>;
  /** Whether a confirmed transaction paid exactly `cents` USDC from `from` to `to`. */
  paidOnChain: (signature: string, from: string, to: string, cents: number) => Promise<boolean>;
}

const accountPath = (uid: string) => `ledgerAccounts/${uid}`;
const quotePath = (id: string) => `quotes/${id}`;
const conversionPath = (uid: string, id: string) => `users/${uid}/conversions/${id}`;
/** Each USDC payment can pay for one sale only. */
const signaturePath = (signature: string) => `convertPayments/${signature}`;

function balancesOf(account: AccountDoc | undefined): Balances {
  return {
    NGN: account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO,
    USD: account?.balanceUsdCents ?? 0,
    USDC: account?.balanceUsdcCents ?? 0,
  };
}

/**
 * Conversions between naira and USDC, straight to and from the person's own dollar wallet.
 * Buying: Faara takes the naira and pays USDC from its float to their wallet. Selling: their
 * phone sends the USDC to the float, and once that payment is confirmed on the blockchain
 * Faara credits the naira. A quote is priced and stored first and runs once.
 */
export class ConvertService {
  constructor(private readonly deps: ConvertDeps) {}

  async quote(uid: string, request: QuoteRequest): Promise<Quote> {
    const { store, now, newId, exchange } = this.deps;
    await consumeRate(store, now, uid, 'convert');
    if (request.from === 'USD' || request.to === 'USD') {
      throw new ApiError('failed-precondition', 'Dollars aren’t available yet. Convert to USDC.');
    }
    const usdc = this.rail();
    if (!(await this.deps.walletOf(uid))) {
      throw new ApiError('failed-precondition', 'Set up your dollar wallet first.');
    }
    const fromMinor = Math.round(request.amount * 100);
    const rates = await exchange.rates();
    const priced = priceConversion(request.from, request.to, fromMinor, rates);
    if (priced.toMinor < 1)
      throw new ApiError('invalid-argument', 'That amount is too small to convert.');
    const id = `QT${newId()}`;
    const createdAt = now();
    const quote: Quote = {
      id,
      from: request.from,
      to: request.to,
      fromMinor,
      toMinor: priced.toMinor,
      feeMinor: priced.feeMinor,
      rate: priced.rate,
      expiresAt: createdAt + QUOTE_TTL_MS,
      // Selling: where the phone sends the USDC.
      ...(request.from === 'USDC' ? { payTo: await usdc.floatAddress() } : {}),
    };
    const { id: _id, ...rest } = quote;
    await store.transaction(async (tx) => {
      tx.set(quotePath(id), { ...rest, uid, status: 'open', createdAt } satisfies QuoteDoc);
    });
    return quote;
  }

  /**
   * Runs a quote, once. Buying starts a USDC payout to the person's wallet and is `pending`
   * until it confirms (`settle`). Selling needs `signature`, the person's own USDC payment
   * into the float; it's checked on the blockchain and the naira is credited at once.
   */
  async execute(uid: string, quoteId: string, signature?: string): Promise<ConversionResult> {
    const { store, now } = this.deps;
    const usdc = this.rail();
    await consumeRate(store, now, uid, 'convert');
    const quote = await store.transaction((tx) => tx.get<QuoteDoc>(quotePath(quoteId)));
    if (!quote || quote.uid !== uid) throw new ApiError('not-found', 'That quote wasn’t found.');
    if (quote.status === 'used') return this.settle(uid, quoteId);
    const wallet = await this.deps.walletOf(uid);
    if (!wallet) throw new ApiError('failed-precondition', 'Set up your dollar wallet first.');
    if (quote.to === 'USDC') return this.buy(uid, quoteId, quote, wallet, usdc);
    return this.sell(uid, quoteId, quote, wallet, usdc, signature);
  }

  private async buy(
    uid: string,
    quoteId: string,
    quote: QuoteDoc,
    wallet: string,
    usdc: UsdcRail,
  ): Promise<ConversionResult> {
    const { store, now } = this.deps;
    if (now() > quote.expiresAt) {
      throw new ApiError('expired' satisfies ApiErrorCode, 'That rate has expired. Get a new one.');
    }
    if ((await usdc.floatCents()) < quote.toMinor) {
      throw new ApiError(
        'failed-precondition',
        'Faara’s test USDC is running low. Try a smaller amount.',
      );
    }
    // Claim the quote and take the naira in one step, so it can only start once.
    await store.transaction(async (tx) => {
      const fresh = await tx.get<QuoteDoc>(quotePath(quoteId));
      if (fresh?.status !== 'open') return;
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const balances = balancesOf(account);
      if (balances.NGN < quote.fromMinor) {
        throw new ApiError('failed-precondition', 'You don’t have enough naira for this.');
      }
      tx.set(accountPath(uid), {
        ...account,
        balanceKobo: balances.NGN - quote.fromMinor,
        updatedAt: now(),
      } satisfies AccountDoc);
      tx.update(quotePath(quoteId), { status: 'used' });
      tx.set(conversionPath(uid, quoteId), this.record(quote, 'pending'));
    });
    try {
      await this.deps.prepareWallet?.(wallet);
      const transferId = await usdc.payout(wallet, quote.toMinor, quoteId);
      await store.transaction(async (tx) => {
        tx.update(conversionPath(uid, quoteId), { transferId });
      });
    } catch (error) {
      await this.fail(uid, quoteId);
      throw error;
    }
    return this.settle(uid, quoteId);
  }

  private async sell(
    uid: string,
    quoteId: string,
    quote: QuoteDoc,
    wallet: string,
    usdc: UsdcRail,
    signature: string | undefined,
  ): Promise<ConversionResult> {
    const { store, now } = this.deps;
    if (!signature) {
      throw new ApiError('invalid-argument', 'Send the USDC from your dollar wallet first.');
    }
    // The USDC may already have moved, so a quote that ran out moments ago is still honoured.
    if (now() > quote.expiresAt + LATE_PAYMENT_MS) {
      throw new ApiError('expired' satisfies ApiErrorCode, 'That rate has expired. Get a new one.');
    }
    if (await store.transaction((tx) => tx.get(signaturePath(signature)))) {
      throw new ApiError('failed-precondition', 'That USDC payment has already been used.');
    }
    const paid = await this.deps.paidOnChain(
      signature,
      wallet,
      await usdc.floatAddress(),
      quote.fromMinor,
    );
    if (!paid) {
      throw new ApiError(
        'failed-precondition',
        'Faara can’t see that USDC payment yet. Try again in a moment.',
      );
    }
    await store.transaction(async (tx) => {
      const fresh = await tx.get<QuoteDoc>(quotePath(quoteId));
      if (fresh?.status !== 'open') return;
      if (await tx.get(signaturePath(signature))) {
        throw new ApiError('failed-precondition', 'That USDC payment has already been used.');
      }
      const account = await tx.get<AccountDoc>(accountPath(uid));
      tx.set(accountPath(uid), {
        ...account,
        balanceKobo: balancesOf(account).NGN + quote.toMinor,
        updatedAt: now(),
      } satisfies AccountDoc);
      tx.update(quotePath(quoteId), { status: 'used' });
      tx.set(signaturePath(signature), { uid, quoteId, at: now() });
      tx.set(conversionPath(uid, quoteId), { ...this.record(quote, 'done'), signature });
    });
    return this.settle(uid, quoteId);
  }

  private record(quote: QuoteDoc, status: ConversionStatus) {
    return {
      from: quote.from,
      to: quote.to,
      fromMinor: quote.fromMinor,
      toMinor: quote.toMinor,
      feeMinor: quote.feeMinor,
      rate: quote.rate,
      status,
      createdAt: this.deps.now(),
    };
  }

  /** Checks a conversion's transfer and finishes it: credits naira, or refunds it on failure. */
  async settle(uid: string, conversionId: string): Promise<ConversionResult> {
    const conversion = await this.deps.store.transaction((tx) =>
      tx.get<ConversionDoc>(conversionPath(uid, conversionId)),
    );
    if (!conversion) throw new ApiError('not-found', 'That conversion wasn’t found.');
    if (conversion.status === 'pending' && conversion.transferId) {
      const state = await this.rail().transferState(conversion.transferId);
      if (state === 'done') await this.finish(uid, conversionId);
      else if (state === 'failed') await this.fail(uid, conversionId);
    }
    const latest = await this.deps.store.transaction((tx) =>
      tx.get<ConversionDoc>(conversionPath(uid, conversionId)),
    );
    return {
      id: conversionId,
      status: latest?.status ?? 'pending',
      balances: await this.balances(uid),
    };
  }

  /** Marks a pending conversion done, crediting naira when USDC was sold. */
  private async finish(uid: string, id: string): Promise<void> {
    const { store, now } = this.deps;
    await store.transaction(async (tx) => {
      const conversion = await tx.get<ConversionDoc>(conversionPath(uid, id));
      if (conversion?.status !== 'pending') return;
      if (conversion.to === 'NGN') {
        const account = await tx.get<AccountDoc>(accountPath(uid));
        tx.set(accountPath(uid), {
          ...account,
          balanceKobo: balancesOf(account).NGN + conversion.toMinor,
          updatedAt: now(),
        } satisfies AccountDoc);
      }
      tx.update(conversionPath(uid, id), { status: 'done' });
    });
  }

  /** Marks a pending conversion failed, giving back the naira taken when USDC was being bought. */
  private async fail(uid: string, id: string): Promise<void> {
    const { store, now } = this.deps;
    await store.transaction(async (tx) => {
      const conversion = await tx.get<ConversionDoc>(conversionPath(uid, id));
      if (conversion?.status !== 'pending') return;
      if (conversion.from === 'NGN') {
        const account = await tx.get<AccountDoc>(accountPath(uid));
        tx.set(accountPath(uid), {
          ...account,
          balanceKobo: balancesOf(account).NGN + conversion.fromMinor,
          updatedAt: now(),
        } satisfies AccountDoc);
      }
      tx.update(conversionPath(uid, id), { status: 'failed' });
    });
  }

  private rail(): UsdcRail {
    if (!this.deps.usdc) {
      throw new ApiError('failed-precondition', 'USDC conversions aren’t switched on yet.');
    }
    return this.deps.usdc;
  }

  async balances(uid: string): Promise<Balances> {
    return this.deps.store.transaction(async (tx) =>
      balancesOf(await tx.get<AccountDoc>(accountPath(uid))),
    );
  }
}
