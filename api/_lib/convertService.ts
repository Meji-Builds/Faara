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

/** Moves real (test-network) USDC. Implemented by Circle wallets. */
export interface UsdcRail {
  usdcCents(uid: string): Promise<number>;
  send(kind: 'payout' | 'collect', uid: string, cents: number, key: string): Promise<string>;
  transferState(id: string): Promise<'pending' | 'done' | 'failed'>;
}

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
}

const accountPath = (uid: string) => `ledgerAccounts/${uid}`;
const quotePath = (id: string) => `quotes/${id}`;
const conversionPath = (uid: string, id: string) => `users/${uid}/conversions/${id}`;

function balancesOf(account: AccountDoc | undefined): Balances {
  return {
    NGN: account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO,
    USD: account?.balanceUsdCents ?? 0,
    USDC: account?.balanceUsdcCents ?? 0,
  };
}

/**
 * Conversions between naira, dollars and USDC. A quote is priced and stored first; executing
 * it moves exactly the quoted amounts in one transaction, once.
 */
export class ConvertService {
  constructor(private readonly deps: ConvertDeps) {}

  async quote(uid: string, request: QuoteRequest): Promise<Quote> {
    const { store, now, newId, exchange } = this.deps;
    await consumeRate(store, now, uid, 'convert');
    if (request.from === 'USD' || request.to === 'USD') {
      throw new ApiError('failed-precondition', 'Dollars aren’t available yet. Convert to USDC.');
    }
    if (!this.deps.usdc) {
      throw new ApiError('failed-precondition', 'USDC conversions aren’t switched on yet.');
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
    };
    const { id: _id, ...rest } = quote;
    await store.transaction(async (tx) => {
      tx.set(quotePath(id), { ...rest, uid, status: 'open', createdAt } satisfies QuoteDoc);
    });
    return quote;
  }

  /**
   * Runs a quote. Naira is moved on Faara's ledger and USDC on the test network, so a
   * conversion starts `pending` and finishes once the transfer confirms (`settle`). Running
   * the same quote again never moves money twice.
   */
  async execute(uid: string, quoteId: string): Promise<ConversionResult> {
    const { store, now } = this.deps;
    const usdc = this.rail();
    await consumeRate(store, now, uid, 'convert');
    const quote = await store.transaction((tx) => tx.get<QuoteDoc>(quotePath(quoteId)));
    if (!quote || quote.uid !== uid) throw new ApiError('not-found', 'That quote wasn’t found.');
    if (quote.status === 'used') return this.settle(uid, quoteId);
    if (now() > quote.expiresAt) {
      throw new ApiError('expired' satisfies ApiErrorCode, 'That rate has expired. Get a new one.');
    }
    const buying = quote.to === 'USDC';
    if (!buying && (await usdc.usdcCents(uid)) < quote.fromMinor) {
      throw new ApiError('failed-precondition', 'You don’t have enough USDC for this.');
    }

    // Claim the quote and take the naira in one step, so it can only start once.
    await store.transaction(async (tx) => {
      const fresh = await tx.get<QuoteDoc>(quotePath(quoteId));
      if (fresh?.status !== 'open') return;
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const balances = balancesOf(account);
      if (buying) {
        if (balances.NGN < quote.fromMinor) {
          throw new ApiError('failed-precondition', 'You don’t have enough naira for this.');
        }
        tx.set(accountPath(uid), {
          ...account,
          balanceKobo: balances.NGN - quote.fromMinor,
          updatedAt: now(),
        } satisfies AccountDoc);
      }
      tx.update(quotePath(quoteId), { status: 'used' });
      tx.set(conversionPath(uid, quoteId), {
        from: quote.from,
        to: quote.to,
        fromMinor: quote.fromMinor,
        toMinor: quote.toMinor,
        feeMinor: quote.feeMinor,
        rate: quote.rate,
        status: 'pending',
        createdAt: now(),
      });
    });

    try {
      const usdcCents = buying ? quote.toMinor : quote.fromMinor;
      const transferId = await usdc.send(buying ? 'payout' : 'collect', uid, usdcCents, quoteId);
      await store.transaction(async (tx) => {
        tx.update(conversionPath(uid, quoteId), { transferId });
      });
    } catch (error) {
      await this.fail(uid, quoteId);
      throw error;
    }
    return this.settle(uid, quoteId);
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
