import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { DocumentStore } from './store';

let app: App | undefined;

/**
 * Admin app from the FIREBASE_SERVICE_ACCOUNT environment variable (the service account
 * JSON, set in Vercel project settings). Never commit the key.
 */
function adminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  app = initializeApp({ credential: cert(JSON.parse(raw)) });
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

/** Verifies a Firebase ID token and returns the user's uid. */
export async function verifyIdToken(idToken: string): Promise<string> {
  const decoded = await getAuth(adminApp()).verifyIdToken(idToken);
  return decoded.uid;
}

export function firestoreStore(db: Firestore): DocumentStore {
  return {
    findId: async (collection, field, value) => {
      const snapshot = await db.collection(collection).where(field, '==', value).limit(1).get();
      return snapshot.docs[0]?.id;
    },
    list: async (collection, { orderBy, limit, after }) => {
      let query = db.collection(collection).orderBy(orderBy, 'desc').limit(limit);
      if (after !== undefined) query = query.where(orderBy, '>', after);
      const snapshot = await query.get();
      return snapshot.docs.map((d) => ({ id: d.id, data: d.data() as never }));
    },
    transaction: (fn) =>
      db.runTransaction((t) =>
        fn({
          get: async (path) => (await t.get(db.doc(path))).data() as never,
          set: (path, data) => void t.set(db.doc(path), data),
          update: (path, data) => void t.update(db.doc(path), data as Record<string, unknown>),
        }),
      ),
  };
}
