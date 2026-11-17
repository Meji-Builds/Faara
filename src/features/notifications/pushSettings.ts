import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';

/**
 * What the server needs to send this person push notifications:
 * `users/{uid}/private/push` (readable and writable only by them and the server).
 */
export interface PushSettings {
  /** Expo push tokens for this person's devices (most recent first, a handful at most). */
  tokens: string[];
  moneyReceived: boolean;
  offers: boolean;
}

export async function savePushSettings(uid: string, settings: PushSettings): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'private', 'push'), { ...settings, updatedAt: Date.now() });
}
