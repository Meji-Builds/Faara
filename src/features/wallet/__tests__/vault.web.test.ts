/**
 * @jest-environment node
 */
import { MAX_PIN_ATTEMPTS, PinLockedError, WrongPinError } from '../vault.types';

// Minimal browser globals for the web vault.
const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  },
});
// Node 22 provides WebCrypto (`globalThis.crypto.subtle`) natively.

// The vault reads `window` and `crypto` when called, so it can be imported after the stubs.
// eslint-disable-next-line import/first
import { vault } from '../vault.web';

const secrets = {
  phrase: 'test phrase',
  seedHex: 'ab'.repeat(32),
  address: 'Addr1111111111111111111111111111111',
};

describe('web wallet vault', () => {
  beforeEach(() => storage.clear());

  it('encrypts secrets at rest and unlocks with the right PIN', async () => {
    await vault.save(secrets, '482913');
    const stored = [...storage.values()].join('');
    expect(stored).not.toContain('test phrase');
    expect(stored).not.toContain(secrets.seedHex);
    expect(await vault.storedAddress()).toBe(secrets.address);
    await expect(vault.unlock('482913')).resolves.toEqual(secrets);
  });

  it('rejects wrong PINs and locks out after too many', async () => {
    await vault.save(secrets, '482913');
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      await expect(vault.unlock('000000')).rejects.toBeInstanceOf(WrongPinError);
    }
    await expect(vault.unlock('000000')).rejects.toBeInstanceOf(PinLockedError);
    // Even the right PIN is refused during the lockout.
    await expect(vault.unlock('482913')).rejects.toBeInstanceOf(PinLockedError);
  }, 30_000);

  it('clears everything', async () => {
    await vault.save(secrets, '482913');
    await vault.clear();
    expect(await vault.storedAddress()).toBeNull();
  });
});
