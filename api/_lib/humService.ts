import {
  assessSafety,
  HUM_CHOOSE_TTL_MS,
  HUM_TOKEN_TTL_MS,
  MANUAL_CODE_LENGTH,
  MAX_CLAIMS_PER_HUM,
  RATE_LIMITS,
  fromMinorUnits,
  pickShapes,
  toMinorUnits,
  type CancelHumRequest,
  type ChooseRecipientRequest,
  type ChooseRecipientResponse,
  type ClaimChannel,
  type CreateTransferRequest,
  type CreateTransferResponse,
  type LookupUserRequest,
  type LookupUserResponse,
  type PaymentChannel,
  type ClaimHumRequest,
  type ClaimHumResponse,
  type CreateHumRequest,
  type CreateHumResponse,
  type HumCurrency,
  type HumStatus,
  type RateLimitedAction,
  type SettleHumRequest,
  type SettleHumResponse,
  type ActivityEntry,
  type SafetyResult,
  type ShapeTriple,
} from '../../shared/hum';

import {
  USDC_MINT,
  centsToUsdcBaseUnits,
  verifyTransfer,
  type ParsedTransaction,
} from '../../shared/solana';

import { ApiError } from './errors';
import type { NairaProvider } from './naira';
import type { DocumentStore, StoreTransaction } from './store';

/**
 * Firestore layout (all writes go through this service; clients only read):
 *
 *   hums/{paymentId}                     the payment intent, readable by its sender
 *   hums/{paymentId}/claims/{claimantUid} one claim per receiver, readable by sender and claimant
 *   humTokens/{token}                     token → paymentId lookup, server-only
 *   humManualCodes/{code}                 six-digit code → paymentId lookup, server-only
 *   rateLimits/{uid}_{action}             fixed one-minute windows, server-only
 *   settlements/{signature}               Solana signatures already used, server-only
 *   users/{uid}/activity/{paymentId}      settled payments, readable by that user
 */

export interface HumDoc {
  senderUid: string;
  senderName: string;
  senderUsername: string;
  amountMinor: number;
  currency: HumCurrency;
  note: string;
  status: HumStatus;
  createdAt: number;
  expiresAt: number;
  chooseBy: number;
  claimCount: number;
  chosenClaimId: string | null;
  shapes: ShapeTriple | null;
  /** Solana addresses, recorded when the hum is created / the recipient is chosen. */
  senderWallet: string | null;
  recipientWallet: string | null;
  settledAt: number | null;
  signature: string | null;
  /** `transfer` for Send-by-username payments; absent (hum) otherwise. */
  kind?: 'hum' | 'transfer';
}

export interface ClaimDoc {
  claimantUid: string;
  fullName: string;
  username: string;
  channel: PaymentChannel;
  distanceCm: number | null;
  createdAt: number;
  status: 'pending' | 'chosen' | 'not-chosen' | 'settled';
  shapes: ShapeTriple | null;
  safety?: SafetyResult;
}

interface TokenDoc {
  paymentId: string;
  expiresAt: number;
}

interface ProfileDoc {
  fullName: string;
  username: string;
  walletAddress?: string;
  /** Firestore Timestamp in production; epoch ms in tests. */
  createdAt?: { toMillis(): number } | number;
}

interface PairDoc {
  count: number;
}

const DAY_MS = 86_400_000;

interface RateLimitDoc {
  windowStart: number;
  count: number;
}

export interface HumServiceDeps {
  store: DocumentStore;
  now: () => number;
  /** Uniform random integer in [0, n), from a CSPRNG in production. */
  randomInt: (n: number) => number;
  newId: () => string;
  naira: NairaProvider;
  /** Fetches a confirmed transaction in `jsonParsed` form, or null if not found. */
  fetchTransaction: (signature: string) => Promise<ParsedTransaction | null>;
  /** Sends a push notification to a person's devices (optional). */
  notify?: (
    uid: string,
    message: { title: string; body: string; data: Record<string, string> },
  ) => Promise<void>;
  /** External wallet risk (Webacy), or null when unavailable. */
  walletRisk: (address: string) => Promise<{ score: number; topIssue: string | null } | null>;
}

const TOKEN_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOKEN_LENGTH = 10;
const TOKEN_ATTEMPTS = 5;
const RATE_WINDOW_MS = 60_000;

const humPath = (id: string) => `hums/${id}`;
const claimPath = (id: string, claimId: string) => `hums/${id}/claims/${claimId}`;
const tokenPath = (token: string) => `humTokens/${token}`;
const manualCodePath = (code: string) => `humManualCodes/${code}`;
const settlementPath = (signature: string) => `settlements/${signature}`;
const activityPath = (uid: string, paymentId: string) => `users/${uid}/activity/${paymentId}`;
/** Settled payments from one person to another, for "Paid N× before". */
const pairPath = (fromUid: string, toUid: string) => `paymentPairs/${fromUid}_${toUid}`;
const userPath = (uid: string) => `users/${uid}`;
const ratePath = (uid: string, action: RateLimitedAction) => `rateLimits/${uid}_${action}`;

export class HumService {
  constructor(private readonly deps: HumServiceDeps) {}

  async createHum(uid: string, request: CreateHumRequest): Promise<CreateHumResponse> {
    const { store, now, newId } = this.deps;
    await this.consumeRate(uid, 'createHum');
    return store.transaction(async (tx) => {
      const profile = await this.requireProfile(tx, uid);
      if (request.currency === 'USDC' && !profile.walletAddress) {
        throw new ApiError('failed-precondition', 'Set up your dollar wallet first.');
      }

      // Find an unused token. Collisions are vanishingly rare (32^10 space), but cheap to rule out.
      let token: string | null = null;
      for (let attempt = 0; attempt < TOKEN_ATTEMPTS && !token; attempt++) {
        const candidate = this.generateToken();
        const existing = await tx.get<TokenDoc>(tokenPath(candidate));
        if (!existing || existing.expiresAt < now()) token = candidate;
      }
      if (!token) throw new ApiError('internal', 'Could not issue a hum code. Try again.');

      // Six-digit fallback code, unique among live hums.
      let manualCode: string | null = null;
      for (let attempt = 0; attempt < TOKEN_ATTEMPTS && !manualCode; attempt++) {
        const candidate = this.generateManualCode();
        const existing = await tx.get<TokenDoc>(manualCodePath(candidate));
        if (!existing || existing.expiresAt < now()) manualCode = candidate;
      }
      if (!manualCode) throw new ApiError('internal', 'Could not issue a hum code. Try again.');

      const createdAt = now();
      const paymentId = newId();
      const hum: HumDoc = {
        senderUid: uid,
        senderName: profile.fullName,
        senderUsername: profile.username,
        amountMinor: toMinorUnits(request.amount),
        currency: request.currency,
        note: request.note ?? '',
        status: 'open',
        createdAt,
        expiresAt: createdAt + HUM_TOKEN_TTL_MS,
        chooseBy: createdAt + HUM_CHOOSE_TTL_MS,
        claimCount: 0,
        chosenClaimId: null,
        shapes: null,
        senderWallet: profile.walletAddress ?? null,
        recipientWallet: null,
        settledAt: null,
        signature: null,
      };
      tx.set(humPath(paymentId), hum);
      tx.set(tokenPath(token), { paymentId, expiresAt: hum.expiresAt } satisfies TokenDoc);
      tx.set(manualCodePath(manualCode), {
        paymentId,
        expiresAt: hum.expiresAt,
      } satisfies TokenDoc);
      return { paymentId, token, manualCode, expiresAt: hum.expiresAt };
    });
  }

  /** Finds a person by username for Send. Reveals only name, username and wallet readiness. */
  async lookupUser(uid: string, request: LookupUserRequest): Promise<LookupUserResponse> {
    await this.consumeRate(uid, 'lookupUser');
    const byPhone = 'phone' in request ? request.phone : null;
    const phoneOwner = byPhone
      ? await this.deps.store.findId('users', 'phone', byPhone)
      : undefined;
    return this.deps.store.transaction(async (tx) => {
      const found =
        'username' in request
          ? await this.findByUsername(tx, request.username)
          : await this.findByUid(tx, phoneOwner);
      if (!found) {
        throw new ApiError(
          'not-found',
          'username' in request
            ? `Nobody on Faara is called @${request.username}.`
            : 'Nobody on Faara has that phone number.',
        );
      }
      return {
        fullName: found.profile.fullName,
        username: found.profile.username,
        hasWallet: Boolean(found.profile.walletAddress),
      };
    });
  }

  /**
   * Send to a username. Creates a payment already addressed to the recipient (no proximity
   * step), which then settles exactly like a hum via `settleHum`.
   */
  async createTransfer(
    uid: string,
    request: CreateTransferRequest,
  ): Promise<CreateTransferResponse> {
    const { store, now, newId } = this.deps;
    await this.consumeRate(uid, 'createHum');
    return store.transaction(async (tx) => {
      const sender = await this.requireProfile(tx, uid);
      const found = await this.findByUsername(tx, request.username);
      if (!found)
        throw new ApiError('not-found', `Nobody on Faara is called @${request.username}.`);
      if (found.uid === uid)
        throw new ApiError('invalid-argument', 'You can’t send money to yourself.');
      const recipientWallet = found.profile.walletAddress ?? null;
      if (request.currency === 'USDC') {
        if (!sender.walletAddress)
          throw new ApiError('failed-precondition', 'Set up your dollar wallet first.');
        if (!recipientWallet) {
          throw new ApiError(
            'failed-precondition',
            `${found.profile.fullName} hasn’t set up a dollar wallet yet. Send naira instead.`,
          );
        }
      }

      const createdAt = now();
      const paymentId = newId();
      const hum: HumDoc = {
        senderUid: uid,
        senderName: sender.fullName,
        senderUsername: sender.username,
        amountMinor: toMinorUnits(request.amount),
        currency: request.currency,
        note: request.note ?? '',
        status: 'chosen',
        createdAt,
        expiresAt: createdAt,
        chooseBy: createdAt + HUM_CHOOSE_TTL_MS,
        claimCount: 1,
        chosenClaimId: found.uid,
        shapes: null,
        senderWallet: sender.walletAddress ?? null,
        recipientWallet,
        settledAt: null,
        signature: null,
        kind: 'transfer',
      };
      const claim: ClaimDoc = {
        claimantUid: found.uid,
        fullName: found.profile.fullName,
        username: found.profile.username,
        channel: 'username',
        distanceCm: null,
        createdAt,
        status: 'chosen',
        shapes: null,
      };
      tx.set(humPath(paymentId), hum);
      tx.set(claimPath(paymentId, found.uid), claim);
      return {
        paymentId,
        claimId: found.uid,
        recipient: {
          fullName: found.profile.fullName,
          username: found.profile.username,
          walletAddress: recipientWallet,
        },
      };
    });
  }

  private async findByUid(
    tx: StoreTransaction,
    uid: string | undefined,
  ): Promise<{ uid: string; profile: ProfileDoc } | null> {
    if (!uid) return null;
    const profile = await tx.get<ProfileDoc>(userPath(uid));
    return profile ? { uid, profile } : null;
  }

  private async findByUsername(
    tx: StoreTransaction,
    username: string,
  ): Promise<{ uid: string; profile: ProfileDoc } | null> {
    const reservation = await tx.get<{ uid: string }>(`usernames/${username}`);
    if (!reservation) return null;
    const profile = await tx.get<ProfileDoc>(userPath(reservation.uid));
    return profile ? { uid: reservation.uid, profile } : null;
  }

  async claimHum(uid: string, request: ClaimHumRequest): Promise<ClaimHumResponse> {
    const { store, now } = this.deps;
    const manual = request.manualCode !== undefined;
    await this.consumeRate(uid, manual ? 'claimManual' : 'claimHum');
    return store.transaction(async (tx) => {
      const lookupPath = manual
        ? manualCodePath(request.manualCode as string)
        : tokenPath(request.token ?? '');
      const tokenDoc = await tx.get<TokenDoc>(lookupPath);
      if (!tokenDoc) throw new ApiError('not-found', 'That hum code isn’t valid.');
      const paymentId = tokenDoc.paymentId;
      const hum = await tx.get<HumDoc>(humPath(paymentId));
      if (!hum) throw new ApiError('not-found', 'That hum code isn’t valid.');
      if (hum.senderUid === uid)
        throw new ApiError('permission-denied', 'You can’t claim your own hum.');

      const response: ClaimHumResponse = {
        paymentId,
        claimId: uid,
        sender: { fullName: hum.senderName, username: hum.senderUsername },
        amount: fromMinorUnits(hum.amountMinor),
        currency: hum.currency,
        note: hum.note,
      };

      // Claiming twice (e.g. sound and Bluetooth both decoded) returns the same claim.
      const existing = await tx.get<ClaimDoc>(claimPath(paymentId, uid));
      if (existing) return response;

      if (hum.status === 'cancelled')
        throw new ApiError('expired', 'The sender cancelled this hum.');
      if (hum.status === 'chosen')
        throw new ApiError('already-chosen', 'The sender already chose who gets paid.');
      if (now() > hum.expiresAt) throw new ApiError('expired', 'That hum code has expired.');
      if (hum.claimCount >= MAX_CLAIMS_PER_HUM) {
        throw new ApiError('resource-exhausted', 'Too many phones caught this hum.');
      }
      const profile = await this.requireProfile(tx, uid);

      const claim: ClaimDoc = {
        claimantUid: uid,
        fullName: profile.fullName,
        username: profile.username,
        channel: request.channel,
        distanceCm: request.distanceCm ?? null,
        createdAt: now(),
        status: 'pending',
        shapes: null,
      };
      tx.set(claimPath(paymentId, uid), claim);
      tx.update(humPath(paymentId), { claimCount: hum.claimCount + 1 });
      return response;
    });
  }

  async chooseRecipient(
    uid: string,
    request: ChooseRecipientRequest,
  ): Promise<ChooseRecipientResponse> {
    const { store, now, randomInt } = this.deps;
    await this.consumeRate(uid, 'chooseRecipient');
    return store.transaction(async (tx) => {
      const hum = await tx.get<HumDoc>(humPath(request.paymentId));
      // Hide other people's hums behind not-found.
      if (!hum || hum.senderUid !== uid) throw new ApiError('not-found', 'Hum not found.');
      const claim = await tx.get<ClaimDoc>(claimPath(request.paymentId, request.claimId));
      if (!claim) throw new ApiError('not-found', 'That person’s claim was not found.');

      const recipientProfile = await tx.get<ProfileDoc>(userPath(request.claimId));
      const walletAddress = recipientProfile?.walletAddress ?? null;
      const recipient = { fullName: claim.fullName, username: claim.username, walletAddress };
      if (hum.status === 'chosen' || hum.status === 'settled') {
        if (hum.chosenClaimId === request.claimId && hum.shapes)
          return {
            shapes: hum.shapes,
            recipient: { ...recipient, walletAddress: hum.recipientWallet },
          };
        throw new ApiError('already-chosen', 'You already chose who gets paid.');
      }
      if (hum.status === 'cancelled')
        throw new ApiError('failed-precondition', 'This hum was cancelled.');
      if (now() > hum.chooseBy)
        throw new ApiError('expired', 'This hum has expired. Start a new one.');
      if (hum.currency === 'USDC' && !walletAddress) {
        throw new ApiError(
          'failed-precondition',
          `${claim.fullName} hasn’t set up a dollar wallet yet. Pay in naira instead.`,
        );
      }

      const shapes = pickShapes(randomInt);
      tx.update(humPath(request.paymentId), {
        status: 'chosen',
        chosenClaimId: request.claimId,
        shapes,
        recipientWallet: walletAddress,
      });
      tx.update(claimPath(request.paymentId, request.claimId), { status: 'chosen', shapes });
      return { shapes, recipient };
    });
  }

  /**
   * Completes a chosen hum. USDC: verifies the on-chain transfer (exact amount, sender's to
   * recipient's wallet; each signature settles one hum). Naira: moves money on the ledger.
   * Safe to retry: a settled hum returns its existing result.
   */
  async settleHum(uid: string, request: SettleHumRequest): Promise<SettleHumResponse> {
    const { store, now, naira, fetchTransaction } = this.deps;
    await this.consumeRate(uid, 'settleHum');

    const hum = await store.transaction((tx) => tx.get<HumDoc>(humPath(request.paymentId)));
    if (!hum || hum.senderUid !== uid) throw new ApiError('not-found', 'Hum not found.');
    if (hum.status === 'settled')
      return { settledAt: hum.settledAt ?? now(), signature: hum.signature };
    if (hum.status === 'cancelled')
      throw new ApiError('failed-precondition', 'This hum was cancelled.');
    if (hum.status !== 'chosen' || !hum.chosenClaimId) {
      throw new ApiError('failed-precondition', 'Choose who gets paid first.');
    }
    const claimId = hum.chosenClaimId;

    let signature: string | null = null;
    if (hum.currency === 'USDC') {
      if (!request.signature)
        throw new ApiError('invalid-argument', 'A transaction signature is required.');
      if (!hum.senderWallet || !hum.recipientWallet) {
        throw new ApiError('failed-precondition', 'Wallet details are missing for this payment.');
      }
      const check = verifyTransfer(await fetchTransaction(request.signature), {
        mint: USDC_MINT,
        senderOwner: hum.senderWallet,
        recipientOwner: hum.recipientWallet,
        amount: centsToUsdcBaseUnits(hum.amountMinor),
      });
      if (!check.ok) throw new ApiError('failed-precondition', check.reason);
      signature = request.signature;
    } else {
      // Idempotent on the payment id, so a retry after a partial failure never pays twice.
      await naira.transfer({
        fromUid: uid,
        toUid: claimId,
        amountKobo: hum.amountMinor,
        reference: request.paymentId,
      });
    }

    let recipientAlert: { title: string; body: string } | null = null;
    const result = await store.transaction(async (tx) => {
      const current = await tx.get<HumDoc>(humPath(request.paymentId));
      if (!current) throw new ApiError('not-found', 'Hum not found.');
      if (current.status === 'settled')
        return { settledAt: current.settledAt ?? now(), signature: current.signature };
      if (signature && (await tx.get(settlementPath(signature)))) {
        throw new ApiError(
          'failed-precondition',
          'That transaction has already paid for another hum.',
        );
      }
      const recipient = await tx.get<ClaimDoc>(claimPath(request.paymentId, claimId));
      const pair = await tx.get<PairDoc>(pairPath(uid, claimId));
      const settledAt = now();

      tx.update(humPath(request.paymentId), { status: 'settled', settledAt, signature });
      tx.update(claimPath(request.paymentId, claimId), { status: 'settled' });
      if (signature) tx.set(settlementPath(signature), { paymentId: request.paymentId, settledAt });
      tx.set(pairPath(uid, claimId), { count: (pair?.count ?? 0) + 1 } satisfies PairDoc);

      const base = {
        kind: current.kind ?? 'hum',
        channel: recipient?.channel ?? 'sound',
        paymentId: request.paymentId,
        amountMinor: current.amountMinor,
        currency: current.currency,
        note: current.note,
        createdAt: settledAt,
        signature,
      };
      tx.set(activityPath(uid, request.paymentId), {
        ...base,
        direction: 'out',
        counterpartyName: recipient?.fullName ?? '',
        counterpartyUsername: recipient?.username ?? '',
      } satisfies ActivityEntry);
      tx.set(activityPath(claimId, request.paymentId), {
        ...base,
        direction: 'in',
        counterpartyName: current.senderName,
        counterpartyUsername: current.senderUsername,
      } satisfies ActivityEntry);
      const amount = fromMinorUnits(current.amountMinor);
      recipientAlert = {
        title: `${current.currency === 'NGN' ? '₦' : '$'}${amount.toLocaleString('en-NG', {
          minimumFractionDigits: current.currency === 'USDC' ? 2 : 0,
        })} from ${current.senderName}`,
        body: current.note || 'Tap to see the receipt.',
      };
      return { settledAt, signature };
    });
    const alert = recipientAlert as { title: string; body: string } | null;
    if (alert && this.deps.notify) {
      await this.deps
        .notify(claimId, { ...alert, data: { paymentId: request.paymentId } })
        .catch(() => undefined);
    }
    return result;
  }

  /**
   * Runs the safety check for a claimant (from the sender's point of view) and stores the
   * result on the claim. Called right after a claim; failures leave the claim unassessed.
   */
  async assessClaim(paymentId: string, claimId: string): Promise<SafetyResult | null> {
    const { store, now, walletRisk } = this.deps;
    const read = await store.transaction(async (tx) => {
      const hum = await tx.get<HumDoc>(humPath(paymentId));
      if (!hum) return null;
      const profile = await tx.get<ProfileDoc>(userPath(claimId));
      const pair = await tx.get<PairDoc>(pairPath(hum.senderUid, claimId));
      return { hum, profile, paidBefore: pair?.count ?? 0 };
    });
    if (!read) return null;

    const createdAt = read.profile?.createdAt;
    const createdMs = typeof createdAt === 'number' ? createdAt : (createdAt?.toMillis() ?? null);
    const address = read.profile?.walletAddress;
    const wallet = read.hum.currency === 'USDC' && address ? await walletRisk(address) : null;
    const safety = assessSafety(
      {
        accountAgeDays: createdMs === null ? null : (now() - createdMs) / DAY_MS,
        paidBefore: read.paidBefore,
        wallet,
      },
      now(),
    );

    await store.transaction(async (tx) => {
      if (await tx.get<ClaimDoc>(claimPath(paymentId, claimId))) {
        tx.update(claimPath(paymentId, claimId), { safety });
      }
    });
    return safety;
  }

  async cancelHum(uid: string, request: CancelHumRequest): Promise<void> {
    await this.deps.store.transaction(async (tx) => {
      const hum = await tx.get<HumDoc>(humPath(request.paymentId));
      if (!hum || hum.senderUid !== uid) throw new ApiError('not-found', 'Hum not found.');
      // Cancelling is allowed until money moves (e.g. the matching shapes didn't match).
      if (hum.status === 'open' || hum.status === 'chosen') {
        tx.update(humPath(request.paymentId), { status: 'cancelled' });
      }
    });
  }

  private async requireProfile(tx: StoreTransaction, uid: string): Promise<ProfileDoc> {
    const profile = await tx.get<ProfileDoc>(userPath(uid));
    if (!profile) throw new ApiError('failed-precondition', 'Finish creating your account first.');
    return profile;
  }

  /**
   * Fixed-window rate limit, committed in its own transaction before the action runs
   * so that failed attempts (e.g. wrong manual codes) count too.
   */
  private async consumeRate(uid: string, action: RateLimitedAction): Promise<void> {
    const path = ratePath(uid, action);
    await this.deps.store.transaction(async (tx) => {
      const now = this.deps.now();
      const current = await tx.get<RateLimitDoc>(path);
      const inWindow = current !== undefined && now - current.windowStart < RATE_WINDOW_MS;
      const count = inWindow ? current.count : 0;
      if (count >= RATE_LIMITS[action]) {
        throw new ApiError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
      }
      tx.set(path, {
        windowStart: inWindow ? current.windowStart : now,
        count: count + 1,
      } satisfies RateLimitDoc);
    });
  }

  private generateManualCode(): string {
    let code = '';
    for (let i = 0; i < MANUAL_CODE_LENGTH; i++) code += String(this.deps.randomInt(10));
    return code;
  }

  private generateToken(): string {
    let token = '';
    for (let i = 0; i < TOKEN_LENGTH; i++)
      token += TOKEN_ALPHABET[this.deps.randomInt(TOKEN_ALPHABET.length)];
    return token;
  }
}
