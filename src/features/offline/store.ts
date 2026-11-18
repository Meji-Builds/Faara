import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { EMPTY_LEDGER, type OfflineLedger } from './ledger';

/**
 * Keeps each person's offline ledger on the phone, so payments made or received with no
 * network survive the app closing. One person's ledger is loaded at a time.
 */
const keyFor = (uid: string) => `faara.offline.v1.${uid}`;

let current: { uid: string; ledger: OfflineLedger } | null = null;
const listeners = new Set<() => void>();
let writes: Promise<void> = Promise.resolve();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Loads the person's ledger (once per sign-in). */
export async function loadLedger(uid: string): Promise<OfflineLedger> {
  if (current?.uid === uid) return current.ledger;
  let ledger = EMPTY_LEDGER;
  try {
    const saved = await AsyncStorage.getItem(keyFor(uid));
    if (saved) ledger = { ...EMPTY_LEDGER, ...(JSON.parse(saved) as Partial<OfflineLedger>) };
  } catch {
    // Unreadable storage starts empty; nothing has been paid from it yet.
  }
  if (current?.uid !== uid) {
    current = { uid, ledger };
    emit();
  }
  return current.ledger;
}

/**
 * Applies a change and saves it. Changes run one after another so two quick updates (for
 * example a payment and a sync) can't overwrite each other.
 */
export function updateLedger<T>(
  uid: string,
  change: (ledger: OfflineLedger) => { ledger: OfflineLedger; result: T },
): Promise<T> {
  const run = writes.then(async () => {
    const before = await loadLedger(uid);
    const { ledger, result } = change(before);
    if (ledger !== before) {
      await AsyncStorage.setItem(keyFor(uid), JSON.stringify(ledger));
      if (current?.uid === uid) current = { uid, ledger };
      emit();
    }
    return result;
  });
  writes = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The person's offline ledger, live (empty until loaded). */
export function useLedger(uid: string | undefined): OfflineLedger {
  return useSyncExternalStore(
    subscribe,
    () => (uid && current?.uid === uid ? current.ledger : EMPTY_LEDGER),
    () => EMPTY_LEDGER,
  );
}
