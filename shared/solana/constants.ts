/** Solana network settings. Faara runs on devnet until launch. */
export const SOLANA_CLUSTER = 'devnet';
export const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

/** Circle's USDC on Solana devnet (test tokens from faucet.circle.com). */
export const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Hum amounts are stored in cents; USDC has 6 decimals. */
export function centsToUsdcBaseUnits(cents: number): bigint {
  return BigInt(Math.round(cents)) * 10_000n;
}

export const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}

/**
 * A Solana Pay link (the standard Solana wallets understand) asking for USDC to `recipient`.
 * With no amount the payer's wallet asks how much. See docs.solanapay.com.
 */
export function solanaPayUrl(recipient: string, label: string, message?: string): string {
  const params = new URLSearchParams({ 'spl-token': USDC_MINT, label: label.slice(0, 60) });
  if (message) params.set('message', message.slice(0, 100));
  return `solana:${recipient}?${params.toString().replace(/\+/g, '%20')}`;
}
