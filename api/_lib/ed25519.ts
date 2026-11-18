import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

/** DER prefix that wraps a raw 32-byte Ed25519 public key as an SPKI key. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function publicKeyFromRaw(rawBase64: string): KeyObject {
  const raw = Buffer.from(rawBase64, 'base64');
  if (raw.length !== 32) throw new Error('Not an Ed25519 public key');
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

function rawFromPublicKey(key: KeyObject): string {
  const der = key.export({ format: 'der', type: 'spki' }) as Buffer;
  return der.subarray(der.length - 32).toString('base64');
}

/** Verifies an Ed25519 signature made over a UTF-8 message. Never throws. */
export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(message, 'utf8'),
      publicKeyFromRaw(publicKey),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export interface Signer {
  /** Raw public key, base64. */
  readonly publicKey: string;
  sign(message: string): string;
}

/** Signs with an Ed25519 private key given as base64 PKCS#8 (the OFFLINE_SIGNING_KEY secret). */
export function signerFromPkcs8(pkcs8Base64: string): Signer {
  const privateKey = createPrivateKey({
    key: Buffer.from(pkcs8Base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = rawFromPublicKey(createPublicKey(privateKey));
  return {
    publicKey,
    sign: (message) => sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64'),
  };
}

/** A fresh key pair: the secret to store, and the signer it makes. */
export function generateSigner(): { pkcs8Base64: string; signer: Signer } {
  const { privateKey } = generateKeyPairSync('ed25519');
  const pkcs8Base64 = (privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString(
    'base64',
  );
  return { pkcs8Base64, signer: signerFromPkcs8(pkcs8Base64) };
}
