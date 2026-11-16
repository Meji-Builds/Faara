/** What the vault stores. Only `address` is non-secret. */
export interface WalletSecrets {
  phrase: string;
  /** 32-byte Solana private key seed, hex. */
  seedHex: string;
  address: string;
}

export interface WalletVault {
  /** True when the secrets are encrypted with the PIN (web) rather than the OS keystore. */
  readonly pinEncrypted: boolean;
  /** The wallet address stored on this device, or null if there is no wallet here. */
  storedAddress(): Promise<string | null>;
  save(secrets: WalletSecrets, pin: string): Promise<void>;
  /**
   * Returns the secrets. Throws `WrongPinError` for a wrong PIN and `PinLockedError` while
   * locked out. On native, pass the PIN unless the caller already verified the user
   * with biometrics.
   */
  unlock(pin: string | null): Promise<WalletSecrets>;
  clear(): Promise<void>;
}

export class WrongPinError extends Error {
  constructor(readonly attemptsLeft: number) {
    super(
      attemptsLeft > 0
        ? `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'Wrong PIN.',
    );
  }
}

export class PinLockedError extends Error {
  constructor(readonly retryAt: number) {
    super('Too many wrong PINs. Try again in a few minutes.');
  }
}

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 5 * 60_000;
