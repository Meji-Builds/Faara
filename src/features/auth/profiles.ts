import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import { UsernameTakenError } from './errors';

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
}

/**
 * Firestore layout:
 *   users/{uid}           profile, readable only by its owner
 *   usernames/{username}  { uid } reservation; makes usernames unique
 */
const userRef = (uid: string) => doc(db, 'users', uid);
const usernameRef = (username: string) => doc(db, 'usernames', username);

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const snapshot = await getDoc(usernameRef(username));
  return !snapshot.exists();
}

export interface NewProfile {
  fullName: string;
  username: string;
  phone: string;
}

/** Creates the profile and reserves the username atomically. */
export async function createProfile(uid: string, profile: NewProfile): Promise<void> {
  await runTransaction(db, async (tx) => {
    const reservation = await tx.get(usernameRef(profile.username));
    if (reservation.exists()) throw new UsernameTakenError(profile.username);
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
      });
    },
    onError,
  );
}
