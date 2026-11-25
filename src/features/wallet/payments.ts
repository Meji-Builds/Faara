import { PublicKey, type Keypair } from '@solana/web3.js';

import { centsToUsdcBaseUnits } from '@shared/solana';

import { postJson } from '@/lib/api/client';

import {
  buildSponsoredUsdcTransfer,
  buildUsdcTransfer,
  latestBlockhash,
  sendAndConfirm,
  SolanaRpcError,
  waitForConfirmation,
} from './solana';

/** Faara's fee-paying address, fetched once. Null when fees can't be covered right now. */
let feePayer: Promise<PublicKey | null> | null = null;
function sponsorAddress(): Promise<PublicKey | null> {
  feePayer ??= postJson<{ address: string }>('/api/wallet/feepayer', {})
    .then(({ address }) => new PublicKey(address))
    .catch(() => {
      feePayer = null; // try again next time
      return null;
    });
  return feePayer;
}

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

/**
 * Signs and sends a USDC transfer for `cents` to `recipient`. Faara pays the network fee, so
 * nobody needs SOL; if Faara can't be reached, the wallet pays its own fee as before.
 * Returns the signature.
 */
export async function sendUsdc(sender: Keypair, recipient: string, cents: number): Promise<string> {
  const [blockhash, sponsor] = await Promise.all([latestBlockhash(), sponsorAddress()]);
  const to = new PublicKey(recipient);
  const amount = centsToUsdcBaseUnits(cents);
  if (sponsor) {
    const tx = buildSponsoredUsdcTransfer(sender, to, amount, blockhash, sponsor);
    const { signature } = await postJson<{ signature: string }>('/api/wallet/sponsor', {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    });
    return waitForConfirmation(signature);
  }
  return sendAndConfirm(buildUsdcTransfer(sender, to, amount, blockhash));
}
