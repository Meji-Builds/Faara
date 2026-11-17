import { MOCK_STARTING_BALANCE_KOBO } from '../../shared/hum';

import { ApiError } from './errors';
import type { DocumentStore } from './store';

/**
 * Naira money movement. Swap the mock for the BaaS partner's implementation once chosen.
 * `transfer` must be idempotent on `reference`: repeating it must not move money twice.
 */
export interface NairaProvider {
  transfer(params: {
    fromUid: string;
    toUid: string;
    amountKobo: number;
    reference: string;
  }): Promise<void>;
  balance(uid: string): Promise<number>;
  /** Adds money from outside (a top-up). Idempotent on `reference`. */
  credit(params: { uid: string; amountKobo: number; reference: string }): Promise<void>;
}

interface AccountDoc {
  balanceKobo: number;
  updatedAt: number;
}

interface EntryDoc {
  fromUid: string;
  toUid: string;
  amountKobo: number;
  createdAt: number;
}

const accountPath = (uid: string) => `ledgerAccounts/${uid}`;
const entryPath = (reference: string) => `ledgerEntries/${reference}`;

/** Firestore-backed mock ledger. Accounts open with a test balance on first use. */
export class MockNairaLedger implements NairaProvider {
  constructor(
    private readonly store: DocumentStore,
    private readonly now: () => number,
  ) {}

  async balance(uid: string): Promise<number> {
    return this.store.transaction(async (tx) => {
      const account = await tx.get<AccountDoc>(accountPath(uid));
      return account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
    });
  }

  async credit({
    uid,
    amountKobo,
    reference,
  }: Parameters<NairaProvider['credit']>[0]): Promise<void> {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
      throw new ApiError('invalid-argument', 'Invalid amount.');
    }
    await this.store.transaction(async (tx) => {
      if (await tx.get<EntryDoc>(entryPath(reference))) return; // already applied
      const account = await tx.get<AccountDoc>(accountPath(uid));
      const now = this.now();
      tx.set(accountPath(uid), {
        balanceKobo: (account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO) + amountKobo,
        updatedAt: now,
      } satisfies AccountDoc);
      tx.set(entryPath(reference), {
        fromUid: 'external',
        toUid: uid,
        amountKobo,
        createdAt: now,
      } satisfies EntryDoc);
    });
  }

  async transfer({
    fromUid,
    toUid,
    amountKobo,
    reference,
  }: Parameters<NairaProvider['transfer']>[0]): Promise<void> {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0)
      throw new ApiError('invalid-argument', 'Invalid amount.');
    if (fromUid === toUid) throw new ApiError('invalid-argument', 'You can’t pay yourself.');
    await this.store.transaction(async (tx) => {
      if (await tx.get<EntryDoc>(entryPath(reference))) return; // already applied
      const from = await tx.get<AccountDoc>(accountPath(fromUid));
      const to = await tx.get<AccountDoc>(accountPath(toUid));
      const fromBalance = from?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
      const toBalance = to?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO;
      if (fromBalance < amountKobo) {
        throw new ApiError('failed-precondition', 'You don’t have enough naira for this payment.');
      }
      const now = this.now();
      tx.set(accountPath(fromUid), {
        balanceKobo: fromBalance - amountKobo,
        updatedAt: now,
      } satisfies AccountDoc);
      tx.set(accountPath(toUid), {
        balanceKobo: toBalance + amountKobo,
        updatedAt: now,
      } satisfies AccountDoc);
      tx.set(entryPath(reference), {
        fromUid,
        toUid,
        amountKobo,
        createdAt: now,
      } satisfies EntryDoc);
    });
  }
}
