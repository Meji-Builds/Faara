/**
 * Minimal devnet client: balances, airdrops and USDC transfers. Transactions are built and
 * signed on the device; only the signed bytes are sent to the RPC node.
 */
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Keypair,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DEFAULT_RPC_URL,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT,
} from '@shared/solana';

const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
const LAMPORTS_PER_SOL = 1_000_000_000;

export class SolanaRpcError extends Error {}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch {
    throw new SolanaRpcError('Can’t reach the Solana network. Check your connection.');
  }
  const body = (await response.json().catch(() => null)) as {
    result?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body || body.error) {
    throw new SolanaRpcError(body?.error?.message ?? `Solana network error (${response.status})`);
  }
  return body.result as T;
}

const tokenProgram = new PublicKey(TOKEN_PROGRAM_ID);
const ataProgram = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
const usdcMint = new PublicKey(USDC_MINT);

/** The associated token account holding `mint` for `owner`. */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey = usdcMint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ataProgram,
  )[0];
}

/** Creates the recipient's token account if it doesn't exist; a no-op otherwise. */
export function createAtaIdempotentInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey = usdcMint,
) {
  return new TransactionInstruction({
    programId: ataProgram,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM_ID), isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/** SPL Token `TransferChecked` (instruction 12): verifies mint and decimals on-chain. */
export function transferCheckedInstruction(
  owner: PublicKey,
  recipient: PublicKey,
  amount: bigint,
  mint: PublicKey = usdcMint,
) {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  data[9] = USDC_DECIMALS;
  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(recipient, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/** Builds and signs a USDC transfer. `amount` is in base units (6 decimals). */
export function buildUsdcTransfer(
  sender: Keypair,
  recipient: PublicKey,
  amount: bigint,
  recentBlockhash: string,
): Transaction {
  const tx = new Transaction({ feePayer: sender.publicKey, recentBlockhash });
  tx.add(
    createAtaIdempotentInstruction(sender.publicKey, recipient),
    transferCheckedInstruction(sender.publicKey, recipient, amount),
  );
  tx.sign(sender);
  return tx;
}

/**
 * Builds a USDC transfer that Faara pays the network fee for: `feePayer` is Faara's address
 * and also covers the recipient's token account if it's new. Only the sender signs here;
 * Faara checks it and adds its signature before sending.
 */
export function buildSponsoredUsdcTransfer(
  sender: Keypair,
  recipient: PublicKey,
  amount: bigint,
  recentBlockhash: string,
  feePayer: PublicKey,
): Transaction {
  const tx = new Transaction({ feePayer, recentBlockhash });
  tx.add(
    createAtaIdempotentInstruction(feePayer, recipient),
    transferCheckedInstruction(sender.publicKey, recipient, amount),
  );
  tx.partialSign(sender);
  return tx;
}

/** Sends a signed transaction and waits for confirmation. Returns the signature. */
export async function sendAndConfirm(tx: Transaction, timeoutMs = 45_000): Promise<string> {
  const encoded = tx.serialize().toString('base64');
  const signature = await rpc<string>('sendTransaction', [
    encoded,
    { encoding: 'base64', preflightCommitment: 'confirmed' },
  ]);
  return waitForConfirmation(signature, timeoutMs);
}

/** Waits until a sent transaction is confirmed. Returns the signature. */
export async function waitForConfirmation(signature: string, timeoutMs = 45_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await rpc<{
      value: ({ err: unknown; confirmationStatus?: string } | null)[];
    }>('getSignatureStatuses', [[signature]]);
    const status = value[0];
    if (status?.err) throw new SolanaRpcError('The transfer failed on the Solana network.');
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')
      return signature;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new SolanaRpcError(
    'The network is slow to confirm. Check the wallet screen before trying again.',
  );
}

export async function latestBlockhash(): Promise<string> {
  const { value } = await rpc<{ value: { blockhash: string } }>('getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  return value.blockhash;
}

/** SOL balance (pays network fees). */
export async function getSolBalance(owner: string): Promise<number> {
  const { value } = await rpc<{ value: number }>('getBalance', [
    owner,
    { commitment: 'confirmed' },
  ]);
  return value / LAMPORTS_PER_SOL;
}

/** USDC balance in dollars. */
export async function getUsdcBalance(owner: string): Promise<number> {
  const { value } = await rpc<{
    value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[];
  }>('getTokenAccountsByOwner', [
    owner,
    { mint: USDC_MINT },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  const base = value.reduce(
    (sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount),
    0n,
  );
  return Number(base) / 10 ** USDC_DECIMALS;
}

/** Devnet only: asks the network for 1 test SOL. Often rate-limited; the faucet site is the fallback. */
export async function requestTestSol(owner: string): Promise<void> {
  await rpc<string>('requestAirdrop', [owner, LAMPORTS_PER_SOL]);
}

export const TEST_FUNDS_LINKS = {
  sol: 'https://faucet.solana.com',
  usdc: 'https://faucet.circle.com',
} as const;

/** USDC that arrived in a wallet: from Faara or from any Solana wallet (Solana Pay). */
export interface UsdcCredit {
  signature: string;
  /** In cents. */
  cents: number;
  /** The paying wallet, when it can be told from the transaction. */
  from: string | null;
  at: number;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

/** What `owner` received in USDC in one transaction, from its pre and post balances. */
export function usdcCreditFrom(
  owner: string,
  meta: { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] },
): { cents: number; from: string | null } | null {
  const amountOf = (list: TokenBalance[] | undefined, who: string) =>
    (list ?? [])
      .filter((b) => b.mint === USDC_MINT && b.owner === who)
      .reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n);
  const received = amountOf(meta.postTokenBalances, owner) - amountOf(meta.preTokenBalances, owner);
  if (received <= 0n) return null;
  // The payer is whoever's USDC went down.
  const owners = new Set(
    (meta.preTokenBalances ?? []).filter((b) => b.mint === USDC_MINT).map((b) => b.owner),
  );
  let from: string | null = null;
  for (const who of owners) {
    if (!who || who === owner) continue;
    if (amountOf(meta.postTokenBalances, who) < amountOf(meta.preTokenBalances, who)) from = who;
  }
  return { cents: Number(received / 10_000n), from };
}

/**
 * USDC payments into `owner`'s wallet since `since` (ms). Signatures in `seen` are skipped
 * and added, so polling only fetches what's new.
 */
export async function recentUsdcCredits(
  owner: string,
  since: number,
  seen: Set<string>,
): Promise<UsdcCredit[]> {
  const account = associatedTokenAddress(new PublicKey(owner)).toBase58();
  const signatures = await rpc<{ signature: string; blockTime: number | null; err: unknown }[]>(
    'getSignaturesForAddress',
    [account, { limit: 15, commitment: 'confirmed' }],
  );
  const fresh = signatures.filter(
    (s) => !s.err && !seen.has(s.signature) && (s.blockTime ?? 0) * 1000 >= since,
  );
  const credits: UsdcCredit[] = [];
  for (const entry of fresh) {
    const tx = await rpc<{
      meta: { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
    } | null>('getTransaction', [
      entry.signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.meta) continue; // not visible yet: try again next time
    seen.add(entry.signature);
    const credit = usdcCreditFrom(owner, tx.meta);
    if (credit)
      credits.push({ signature: entry.signature, at: (entry.blockTime ?? 0) * 1000, ...credit });
  }
  return credits;
}

/** Sends SOL from the person's wallet (they pay the tiny fee themselves). Returns the signature. */
export async function sendSol(
  sender: Keypair,
  recipient: string,
  lamports: number,
): Promise<string> {
  const tx = new Transaction({
    feePayer: sender.publicKey,
    recentBlockhash: await latestBlockhash(),
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: sender.publicKey,
      toPubkey: new PublicKey(recipient),
      lamports,
    }),
  );
  tx.sign(sender);
  return sendAndConfirm(tx);
}
