import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import { peekPendingRecipient } from '@/features/referral';

import { ProfileTimeoutError, UsernameTakenError } from './errors';

/** 3–20 characters: lowercase letters, numbers, dots and underscores. */
export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  /** E.164, from the verified sign-in. */
  phone: string;
  verificationTier: number;
  createdAt: Timestamp | null;
  /** Public Solana address of the user's dollar wallet, once set up. */
  walletAddress: string | null;
}

/**
 * Firestore layout:
 *   users/{uid}           profile, readable only by its owner
 *   usernames/{username}  { uid } reservation; makes usernames unique
 */
const userRef = (uid: string) => doc(db, 'users', uid);
const usernameRef = (username: string) => doc(db, 'usernames', username);

/** True if nobody holds the username, or `uid` (the current user) already holds it. */
export async function isUsernameAvailable(username: string, uid?: string): Promise<boolean> {
  const snapshot = await getDoc(usernameRef(username));
  return !snapshot.exists() || (uid !== undefined && snapshot.data().uid === uid);
}

export interface NewProfile {
  fullName: string;
  username: string;
  phone: string;
}

const WRITE_TIMEOUT_MS = 15_000;

/** Rejects with ProfileTimeoutError if `promise` takes too long. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProfileTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Creates the profile and reserves the username atomically. */
export async function createProfile(uid: string, profile: NewProfile): Promise<void> {
  const referrer = peekPendingRecipient();
  await withTimeout(saveProfile(uid, profile), WRITE_TIMEOUT_MS);
  // Remember who sent them (the owner of the pay link they opened). Never blocks sign-up.
  if (referrer && referrer !== profile.username) {
    setDoc(doc(db, 'referrals', uid), { referredBy: referrer, createdAt: serverTimestamp() }).catch(
      () => undefined,
    );
  }
}

async function saveProfile(uid: string, profile: NewProfile): Promise<void> {
  await runTransaction(db, async (tx) => {
    const reservation = await tx.get(usernameRef(profile.username));
    if (reservation.exists()) {
      // A retry after a save that succeeded but wasn't noticed: nothing left to do.
      const existing = await tx.get(userRef(uid));
      if (reservation.data().uid === uid && existing.exists()) return;
      throw new UsernameTakenError(profile.username);
    }
    tx.set(usernameRef(profile.username), { uid, createdAt: serverTimestamp() });
    tx.set(userRef(uid), {
      fullName: profile.fullName.trim(),
      username: profile.username,
      phone: profile.phone,
      verificationTier: 1,
      createdAt: serverTimestamp(),
    });
  });
}

/** Subscribes to a profile; emits null when it doesn't exist. */
export function watchProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    userRef(uid),
    (snapshot) => {
      if (!snapshot.exists()) return onChange(null);
      const data = snapshot.data();
      onChange({
        uid,
        fullName: String(data.fullName ?? ''),
        username: String(data.username ?? ''),
        phone: String(data.phone ?? ''),
        verificationTier: Number(data.verificationTier ?? 1),
        createdAt: (data.createdAt as Timestamp | undefined) ?? null,
        walletAddress: typeof data.walletAddress === 'string' ? data.walletAddress : null,
      });
    },
    onError,
  );
}

/** Publishes the user's wallet address (public key only) so payers can send to it. */
export async function setWalletAddress(uid: string, walletAddress: string): Promise<void> {
  await withTimeout(updateDoc(userRef(uid), { walletAddress }), WRITE_TIMEOUT_MS);
}
