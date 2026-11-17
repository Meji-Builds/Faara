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

const NAMES: Record<ConvertCurrency, string> = { NGN: 'naira', USD: 'dollars', USDC: 'USDC' };

/**
 * Conversions between naira, dollars and USDC. A quote is priced and stored first; executing
 * it moves exactly the quoted amounts in one transaction, once.
 */
export class ConvertService {
  constructor(private readonly deps: ConvertDeps) {}

  async quote(uid: string, request: QuoteRequest): Promise<Quote> {
    const { store, now, newId, exchange } = this.deps;
    await consumeRate(store, now, uid, 'convert');
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

  /** Runs a quote. Repeating a quote that already ran returns the balances without moving money again. */
  async execute(uid: string, quoteId: string): Promise<Balances> {
    const { store, now } = this.deps;
    await consumeRate(store, now, uid, 'convert');
    return store.transaction(async (tx) => {
      const quote = await tx.get<QuoteDoc>(quotePath(quoteId));
      if (!quote || quote.uid !== uid) throw new ApiError('not-found', 'That quote wasn’t found.');
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const balances = balancesOf(account);
      if (quote.status === 'used') return balances;
      if (now() > quote.expiresAt) {
        throw new ApiError(
          'expired' satisfies ApiErrorCode,
          'That rate has expired. Get a new one.',
        );
      }
      if (balances[quote.from] < quote.fromMinor) {
        throw new ApiError(
          'failed-precondition',
          `You don’t have enough ${NAMES[quote.from]} for this.`,
        );
      }
      balances[quote.from] -= quote.fromMinor;
      balances[quote.to] += quote.toMinor;
      tx.set(accountPath(uid), {
        ...account,
        balanceKobo: balances.NGN,
        balanceUsdCents: balances.USD,
        balanceUsdcCents: balances.USDC,
        updatedAt: now(),
      } satisfies AccountDoc);
      tx.update(quotePath(quoteId), { status: 'used' });
      tx.set(conversionPath(uid, quoteId), {
        from: quote.from,
        to: quote.to,
        fromMinor: quote.fromMinor,
        toMinor: quote.toMinor,
        feeMinor: quote.feeMinor,
        rate: quote.rate,
        createdAt: now(),
      });
      return balances;
    });
  }

  async balances(uid: string): Promise<Balances> {
    return this.deps.store.transaction(async (tx) =>
      balancesOf(await tx.get<AccountDoc>(accountPath(uid))),
    );
  }
}
