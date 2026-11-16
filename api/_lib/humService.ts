import {
  HUM_CHOOSE_TTL_MS,
  HUM_TOKEN_TTL_MS,
  MAX_CLAIMS_PER_HUM,
  RATE_LIMITS,
  fromMinorUnits,
  pickShapes,
  toMinorUnits,
  type CancelHumRequest,
  type ChooseRecipientRequest,
  type ChooseRecipientResponse,
  type ClaimChannel,
  type ClaimHumRequest,
  type ClaimHumResponse,
  type CreateHumRequest,
  type CreateHumResponse,
  type HumCurrency,
  type HumStatus,
  type RateLimitedAction,
  type ShapeTriple,
} from '../../shared/hum';

import { ApiError } from './errors';
import type { DocumentStore, StoreTransaction } from './store';

/**
 * Firestore layout (all writes go through this service; clients only read):
 *
 *   hums/{paymentId}                     the payment intent, readable by its sender
 *   hums/{paymentId}/claims/{claimantUid} one claim per receiver, readable by sender and claimant
 *   humTokens/{token}                     token → paymentId lookup, server-only
 *   rateLimits/{uid}_{action}             fixed one-minute windows, server-only
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
}

export interface ClaimDoc {
  claimantUid: string;
  fullName: string;
  username: string;
  channel: ClaimChannel;
  distanceCm: number | null;
  createdAt: number;
  status: 'pending' | 'chosen' | 'not-chosen';
  shapes: ShapeTriple | null;
}

interface TokenDoc {
  paymentId: string;
  expiresAt: number;
}

interface ProfileDoc {
  fullName: string;
  username: string;
}

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
}

const TOKEN_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOKEN_LENGTH = 10;
const TOKEN_ATTEMPTS = 5;
const RATE_WINDOW_MS = 60_000;

const humPath = (id: string) => `hums/${id}`;
const claimPath = (id: string, claimId: string) => `hums/${id}/claims/${claimId}`;
const tokenPath = (token: string) => `humTokens/${token}`;
const userPath = (uid: string) => `users/${uid}`;
const ratePath = (uid: string, action: RateLimitedAction) => `rateLimits/${uid}_${action}`;

export class HumService {
  constructor(private readonly deps: HumServiceDeps) {}

  async createHum(uid: string, request: CreateHumRequest): Promise<CreateHumResponse> {
    const { store, now, newId } = this.deps;
    return store.transaction(async (tx) => {
      const commitRate = await this.checkRate(tx, uid, 'createHum');
      const profile = await this.requireProfile(tx, uid);

      // Find an unused token. Collisions are vanishingly rare (32^10 space), but cheap to rule out.
      let token: string | null = null;
      for (let attempt = 0; attempt < TOKEN_ATTEMPTS && !token; attempt++) {
        const candidate = this.generateToken();
        const existing = await tx.get<TokenDoc>(tokenPath(candidate));
        if (!existing || existing.expiresAt < now()) token = candidate;
      }
      if (!token) throw new ApiError('internal', 'Could not issue a hum code. Try again.');

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
      };
      tx.set(humPath(paymentId), hum);
      tx.set(tokenPath(token), { paymentId, expiresAt: hum.expiresAt } satisfies TokenDoc);
      commitRate();
      return { paymentId, token, expiresAt: hum.expiresAt };
    });
  }

  async claimHum(uid: string, request: ClaimHumRequest): Promise<ClaimHumResponse> {
    const { store, now } = this.deps;
    return store.transaction(async (tx) => {
      const commitRate = await this.checkRate(tx, uid, 'claimHum');
      const tokenDoc = await tx.get<TokenDoc>(tokenPath(request.token));
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
      commitRate();
      return response;
    });
  }

  async chooseRecipient(
    uid: string,
    request: ChooseRecipientRequest,
  ): Promise<ChooseRecipientResponse> {
    const { store, now, randomInt } = this.deps;
    return store.transaction(async (tx) => {
      const commitRate = await this.checkRate(tx, uid, 'chooseRecipient');
      const hum = await tx.get<HumDoc>(humPath(request.paymentId));
      // Hide other people's hums behind not-found.
      if (!hum || hum.senderUid !== uid) throw new ApiError('not-found', 'Hum not found.');
      const claim = await tx.get<ClaimDoc>(claimPath(request.paymentId, request.claimId));
      if (!claim) throw new ApiError('not-found', 'That person’s claim was not found.');

      const recipient = { fullName: claim.fullName, username: claim.username };
      if (hum.status === 'chosen') {
        if (hum.chosenClaimId === request.claimId && hum.shapes)
          return { shapes: hum.shapes, recipient };
        throw new ApiError('already-chosen', 'You already chose who gets paid.');
      }
      if (hum.status === 'cancelled')
        throw new ApiError('failed-precondition', 'This hum was cancelled.');
      if (now() > hum.chooseBy)
        throw new ApiError('expired', 'This hum has expired. Start a new one.');

      const shapes = pickShapes(randomInt);
      tx.update(humPath(request.paymentId), {
        status: 'chosen',
        chosenClaimId: request.claimId,
        shapes,
      });
      tx.update(claimPath(request.paymentId, request.claimId), { status: 'chosen', shapes });
      commitRate();
      return { shapes, recipient };
    });
  }

  async cancelHum(uid: string, request: CancelHumRequest): Promise<void> {
    await this.deps.store.transaction(async (tx) => {
      const hum = await tx.get<HumDoc>(humPath(request.paymentId));
      if (!hum || hum.senderUid !== uid) throw new ApiError('not-found', 'Hum not found.');
      if (hum.status === 'open') tx.update(humPath(request.paymentId), { status: 'cancelled' });
    });
  }

  private async requireProfile(tx: StoreTransaction, uid: string): Promise<ProfileDoc> {
    const profile = await tx.get<ProfileDoc>(userPath(uid));
    if (!profile) throw new ApiError('failed-precondition', 'Finish creating your account first.');
    return profile;
  }

  /**
   * Fixed-window rate limit. Reads now; returns a function that records the request,
   * to be called with the other writes once all reads are done.
   */
  private async checkRate(
    tx: StoreTransaction,
    uid: string,
    action: RateLimitedAction,
  ): Promise<() => void> {
    const path = ratePath(uid, action);
    const now = this.deps.now();
    const current = await tx.get<RateLimitDoc>(path);
    const inWindow = current !== undefined && now - current.windowStart < RATE_WINDOW_MS;
    const count = inWindow ? current.count : 0;
    if (count >= RATE_LIMITS[action]) {
      throw new ApiError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
    }
    return () =>
      tx.set(path, {
        windowStart: inWindow ? current.windowStart : now,
        count: count + 1,
      } satisfies RateLimitDoc);
  }

  private generateToken(): string {
    let token = '';
    for (let i = 0; i < TOKEN_LENGTH; i++)
      token += TOKEN_ALPHABET[this.deps.randomInt(TOKEN_ALPHABET.length)];
    return token;
  }
}
