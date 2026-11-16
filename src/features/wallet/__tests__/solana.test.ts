import { Keypair, PublicKey } from '@solana/web3.js';

import { TOKEN_PROGRAM_ID, USDC_MINT } from '@shared/solana';

import {
  associatedTokenAddress,
  buildUsdcTransfer,
  createAtaIdempotentInstruction,
  transferCheckedInstruction,
} from '../solana';

describe('USDC transfer building', () => {
  const sender = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;

  it('derives distinct, deterministic token accounts per owner', () => {
    const a = associatedTokenAddress(sender.publicKey);
    expect(a.equals(associatedTokenAddress(sender.publicKey))).toBe(true);
    expect(a.equals(associatedTokenAddress(recipient))).toBe(false);
    expect(PublicKey.isOnCurve(a.toBytes())).toBe(false); // PDAs are off-curve
  });

  it('encodes TransferChecked: tag 12, little-endian amount, 6 decimals', () => {
    const ix = transferCheckedInstruction(sender.publicKey, recipient, 40_500_000n);
    expect(ix.programId.toBase58()).toBe(TOKEN_PROGRAM_ID);
    expect(Array.from(ix.data)).toEqual([12, 0x20, 0xfb, 0x69, 0x02, 0, 0, 0, 0, 6]);
    expect(ix.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([
      [false, true],
      [false, false],
      [false, true],
      [true, false],
    ]);
    expect(ix.keys[1]?.pubkey.toBase58()).toBe(USDC_MINT);
    expect(ix.keys[3]?.pubkey.equals(sender.publicKey)).toBe(true);
  });

  it('creates the recipient token account idempotently (instruction 1)', () => {
    const ix = createAtaIdempotentInstruction(sender.publicKey, recipient);
    expect(Array.from(ix.data)).toEqual([1]);
    expect(ix.keys[1]?.pubkey.equals(associatedTokenAddress(recipient))).toBe(true);
  });

  it('builds a transaction signed by the sender as fee payer', () => {
    const tx = buildUsdcTransfer(sender, recipient, 1_000_000n, '11111111111111111111111111111111');
    expect(tx.feePayer?.equals(sender.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(2);
    expect(tx.verifySignatures()).toBe(true);
  });
});
