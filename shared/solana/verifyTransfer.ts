/**
 * Server-side check that a confirmed Solana transaction paid a hum: the recipient's USDC
 * balance (for the given mint) rose by exactly the amount, and the sender's fell by it.
 * Works on the `jsonParsed` form returned by the `getTransaction` RPC method.
 */

interface TokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface ParsedTransaction {
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
}

export interface ExpectedTransfer {
  mint: string;
  senderOwner: string;
  recipientOwner: string;
  amount: bigint;
}

export type TransferCheck = { ok: true } | { ok: false; reason: string };

function balanceOf(
  balances: TokenBalance[] | null | undefined,
  owner: string,
  mint: string,
): bigint {
  let total = 0n;
  for (const entry of balances ?? []) {
    if (entry.owner === owner && entry.mint === mint) total += BigInt(entry.uiTokenAmount.amount);
  }
  return total;
}

export function verifyTransfer(
  tx: ParsedTransaction | null,
  expected: ExpectedTransfer,
): TransferCheck {
  if (!tx?.meta) return { ok: false, reason: 'Transaction not found or not confirmed yet.' };
  if (tx.meta.err) return { ok: false, reason: 'The transaction failed on-chain.' };
  const { preTokenBalances: pre, postTokenBalances: post } = tx.meta;
  const received =
    balanceOf(post, expected.recipientOwner, expected.mint) -
    balanceOf(pre, expected.recipientOwner, expected.mint);
  const sent =
    balanceOf(pre, expected.senderOwner, expected.mint) -
    balanceOf(post, expected.senderOwner, expected.mint);
  if (received !== expected.amount) {
    return { ok: false, reason: 'The transaction didn’t pay the recipient the right amount.' };
  }
  if (sent !== expected.amount)
    return { ok: false, reason: 'The transaction wasn’t paid from the sender’s wallet.' };
  return { ok: true };
}
