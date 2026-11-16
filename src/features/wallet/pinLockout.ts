import { MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS, PinLockedError, WrongPinError } from './vault.types';

/** Persisted failed-attempt counter shared by the native and web vaults. */
export interface LockoutState {
  failures: number;
  lockedUntil: number;
}

export interface LockoutStorage {
  read(): Promise<LockoutState>;
  write(state: LockoutState): Promise<void>;
}

export async function assertNotLocked(storage: LockoutStorage, now = Date.now()): Promise<void> {
  const state = await storage.read();
  if (state.lockedUntil > now) throw new PinLockedError(state.lockedUntil);
}

/** Records a wrong PIN and returns the error to throw. */
export async function recordFailure(storage: LockoutStorage, now = Date.now()): Promise<Error> {
  const state = await storage.read();
  const failures = (state.lockedUntil > 0 && state.lockedUntil <= now ? 0 : state.failures) + 1;
  if (failures >= MAX_PIN_ATTEMPTS) {
    const lockedUntil = now + PIN_LOCKOUT_MS;
    await storage.write({ failures: 0, lockedUntil });
    return new PinLockedError(lockedUntil);
  }
  await storage.write({ failures, lockedUntil: 0 });
  return new WrongPinError(MAX_PIN_ATTEMPTS - failures);
}

export async function recordSuccess(storage: LockoutStorage): Promise<void> {
  await storage.write({ failures: 0, lockedUntil: 0 });
}

export function parseLockout(raw: string | null): LockoutState {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<LockoutState>) : {};
    return { failures: Number(parsed.failures ?? 0), lockedUntil: Number(parsed.lockedUntil ?? 0) };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}
