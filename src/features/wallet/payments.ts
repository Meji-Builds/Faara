import { PublicKey, type Keypair } from '@solana/web3.js';

import { centsToUsdcBaseUnits } from '@shared/solana';

import { buildUsdcTransfer, latestBlockhash, sendAndConfirm, SolanaRpcError } from './solana';

/** Turns common Solana failures into messages people can act on. */
export function solanaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/no record of a prior credit|insufficient lamports/i.test(message)) {
    return 'You need a little test SOL for network fees. Get some from your Dollar wallet screen.';
  }
  if (/insufficient funds|custom program error: 0x1\b/i.test(message)) {
    return 'You don’t have enough USDC for this payment.';
  }
  if (error instanceof SolanaRpcError) return message;
  return 'The transfer couldn’t be sent. Try again.';
}

/** Signs and sends a USDC transfer for `cents` to `recipient`. Returns the signature. */
export async function sendUsdc(sender: Keypair, recipient: string, cents: number): Promise<string> {
  const blockhash = await latestBlockhash();
  const tx = buildUsdcTransfer(
    sender,
    new PublicKey(recipient),
    centsToUsdcBaseUnits(cents),
    blockhash,
  );
  return sendAndConfirm(tx);
}
