/**
 * Non-custodial key handling: a BIP-39 recovery phrase, and the Solana key derived from it
 * with SLIP-0010 (ed25519) at m/44'/501'/0'/0' — the path Phantom and Solflare use, so the
 * phrase restores the same address in other wallets. Keys never leave the device.
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Keypair } from '@solana/web3.js';

export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";
const HARDENED = 0x80000000;
const ED25519_KEY = new TextEncoder().encode('ed25519 seed');

/** A new 12-word recovery phrase from the platform CSPRNG. */
export function createRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

/** SLIP-0010 ed25519 derivation (hardened indices only). Returns the 32-byte private key. */
export function deriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  const segments = path.split('/');
  if (segments[0] !== 'm') throw new Error(`Invalid derivation path: ${path}`);
  let digest = hmac(sha512, ED25519_KEY, seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);
  for (const segment of segments.slice(1)) {
    if (!segment.endsWith("'"))
      throw new Error('ed25519 derivation supports hardened indices only');
    const index = Number.parseInt(segment.slice(0, -1), 10) + HARDENED;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index >>> 0, false);
    digest = hmac(sha512, chainCode, data);
    key = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }
  return key;
}

/** The 32-byte Solana private key seed for a recovery phrase. */
export function solanaSeedFromPhrase(phrase: string): Uint8Array {
  const normalized = normalizePhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) throw new Error('Invalid recovery phrase');
  return deriveEd25519(mnemonicToSeedSync(normalized), SOLANA_DERIVATION_PATH);
}

export function keypairFromSeed(seed: Uint8Array): Keypair {
  return Keypair.fromSeed(seed);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('Invalid hex');
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}
