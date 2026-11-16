import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '@shared/hum';

import { db } from '@/lib/firebase';

/** Live naira balance (kobo) from the mock ledger. New accounts show the opening balance. */
export function watchNairaBalance(uid: string, onChange: (kobo: number) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'ledgerAccounts', uid),
    (snapshot) => onChange(Number(snapshot.data()?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO)),
    () => onChange(MOCK_STARTING_BALANCE_KOBO),
  );
}

/** Live list of settled payments, newest first. */
export function watchActivity(
  uid: string,
  max: number,
  onChange: (entries: ActivityEntry[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, 'activity'), orderBy('createdAt', 'desc'), limit(max)),
    (snapshot) => onChange(snapshot.docs.map((d) => d.data() as ActivityEntry)),
    () => onChange([]),
  );
}
