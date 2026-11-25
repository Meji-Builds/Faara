import type { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DEFAULT_RPC_URL,
  SOLANA_CLUSTER,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT,
} from '../../shared/solana';

import { ApiError } from './errors';
import { consumeRate } from './rateLimit';
import type { DocumentStore } from './store';

type Web3 = typeof import('@solana/web3.js');

/**
 * The Solana library, loaded only when a fee is sponsored. Every server function shares this
 * code, so loading it up front would let a problem in the library take down every route.
 */
let web3: Web3 | null = null;
function solana(): Web3 {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  web3 ??= require('@solana/web3.js') as Web3;
  return web3;
}

/** Program and mint addresses, made once the library is loaded. */
function addresses() {
  const { PublicKey } = solana();
  return {
    tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
    ataProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
    systemProgram: new PublicKey(SYSTEM_PROGRAM_ID),
    usdcMint: new PublicKey(USDC_MINT),
  };
}

/** Keep at least this much SOL for fees; on the test network it tops itself up. */
const LOW_BALANCE_LAMPORTS = 50_000_000; // 0.05 SOL
const AIRDROP_LAMPORTS = 1_000_000_000; // 1 SOL

function ata(owner: PublicKey): PublicKey {
  const { tokenProgram, usdcMint, ataProgram } = addresses();
  return solana().PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), usdcMint.toBuffer()],
    ataProgram,
  )[0];
}

/** What a sponsored transaction does, once checked. */
export interface SponsoredTransfer {
  recipient: PublicKey | null;
  amount: bigint;
}

const refuse = (detail: string): never => {
  throw new ApiError('invalid-argument', `Faara can only cover fees for a USDC payment. ${detail}`);
};

/**
 * Checks that `tx` is only a USDC payment from `owner`'s own token account, with `sponsor`
 * paying the network fee and (at most) the recipient's token account. Anything else, such as
 * other programs, other tokens, extra instructions, or the sponsor as a source of money, is
 * refused, so the sponsor's key can never be used to move anything but fees.
 */
export function checkSponsoredTransfer(
  tx: Transaction,
  sponsor: PublicKey,
  owner: PublicKey,
): SponsoredTransfer {
  const { tokenProgram, ataProgram, systemProgram, usdcMint } = addresses();
  if (!tx.feePayer?.equals(sponsor)) refuse('The fee payer is wrong.');
  if (owner.equals(sponsor)) refuse('The sender is wrong.');
  const instructions = tx.instructions;
  if (instructions.length < 1 || instructions.length > 2) refuse('It has the wrong steps.');

  let recipient: PublicKey | null = null;
  if (instructions.length === 2) {
    const create = instructions[0];
    const keys = create?.keys ?? [];
    if (
      !create?.programId.equals(ataProgram) ||
      create.data.length !== 1 ||
      create.data[0] !== 1 ||
      keys.length !== 6 ||
      !keys[0]?.pubkey.equals(sponsor) ||
      !keys[3]?.pubkey.equals(usdcMint) ||
      !keys[4]?.pubkey.equals(systemProgram) ||
      !keys[5]?.pubkey.equals(tokenProgram)
    ) {
      refuse('The account set-up step is wrong.');
    }
    recipient = keys[2]?.pubkey ?? null;
    if (!recipient || !keys[1]?.pubkey.equals(ata(recipient))) refuse('The recipient is wrong.');
  }

  const transfer = instructions[instructions.length - 1];
  const keys = transfer?.keys ?? [];
  const data = transfer?.data ?? Buffer.alloc(0);
  if (
    !transfer?.programId.equals(tokenProgram) ||
    data.length !== 10 ||
    data[0] !== 12 || // TransferChecked
    data[9] !== USDC_DECIMALS ||
    keys.length !== 4 ||
    !keys[0]?.pubkey.equals(ata(owner)) ||
    !keys[1]?.pubkey.equals(usdcMint) ||
    !keys[3]?.pubkey.equals(owner) ||
    !keys[3]?.isSigner
  ) {
    refuse('The payment step is wrong.');
  }
  if (recipient && !keys[2]?.pubkey.equals(ata(recipient))) refuse('The recipient is wrong.');
  if (keys.some((key) => key.pubkey.equals(sponsor)))
    refuse('The fee payer can’t be in the payment.');
  const amount = Buffer.from(data).readBigUInt64LE(1);
  if (amount <= 0n) refuse('The amount is wrong.');

  // The sender must already have signed, and nobody else apart from the sponsor.
  const ownerSignature = tx.signatures.find((s) => s.publicKey.equals(owner));
  if (!ownerSignature?.signature) refuse('It isn’t signed by your wallet.');
  if (tx.signatures.some((s) => !s.publicKey.equals(owner) && !s.publicKey.equals(sponsor))) {
    refuse('It has extra signers.');
  }
  if (!tx.verifySignatures(false)) refuse('The signature doesn’t match.');
  return { recipient, amount };
}

export interface FeeSponsorDeps {
  store: DocumentStore;
  now: () => number;
  /** FEE_PAYER_KEY: the sponsor's 64-byte secret key, base64. Made and kept server-side if unset. */
  secretKey: string | null;
  rpcUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Faara pays the Solana network fee for its users' USDC payments, so nobody needs to buy SOL.
 * The phone builds and signs the payment with Faara's address as fee payer; this checks it
 * strictly, adds Faara's signature and sends it.
 */
export class FeeSponsor {
  private keypair?: Promise<Keypair>;

  constructor(private readonly deps: FeeSponsorDeps) {}

  private rpcUrl(): string {
    return this.deps.rpcUrl ?? process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  }

  private loadKeypair(): Promise<Keypair> {
    if (this.deps.secretKey) {
      const { Keypair } = solana();
      return Promise.resolve(Keypair.fromSecretKey(Buffer.from(this.deps.secretKey, 'base64')));
    }
    const { Keypair } = solana();
    this.keypair ??= this.deps.store.transaction(async (tx) => {
      const saved = await tx.get<{ secretKey: string }>('serverKeys/feePayer');
      if (saved) return Keypair.fromSecretKey(Buffer.from(saved.secretKey, 'base64'));
      const fresh = Keypair.generate();
      tx.set('serverKeys/feePayer', {
        secretKey: Buffer.from(fresh.secretKey).toString('base64'),
        createdAt: this.deps.now(),
      });
      return fresh;
    });
    return this.keypair;
  }

  /**
   * The address phones put as fee payer. Phones ask just before paying, so this is also when
   * the sponsor checks it has enough SOL (and tops up on the test network).
   */
  async address(): Promise<string> {
    const address = (await this.loadKeypair()).publicKey.toBase58();
    await this.keepFunded(address).catch(() => undefined);
    return address;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await (this.deps.fetch ?? fetch)(this.rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await response.json().catch(() => null)) as {
      result?: T;
      error?: { message?: string };
    } | null;
    if (!body || body.error || body.result === undefined) {
      throw new ApiError(
        'unavailable',
        body?.error?.message ? `Solana: ${body.error.message}` : 'Can’t reach Solana right now.',
      );
    }
    return body.result;
  }

  /** On the test network, keeps the sponsor topped up with free test SOL. */
  private async keepFunded(address: string): Promise<void> {
    if (SOLANA_CLUSTER !== 'devnet') return;
    const { value } = await this.rpc<{ value: number }>('getBalance', [address]);
    if (value < LOW_BALANCE_LAMPORTS) {
      await this.rpc('requestAirdrop', [address, AIRDROP_LAMPORTS]).catch(() => undefined);
    }
  }

  /**
   * Gets the caller's own dollar wallet ready to receive USDC, when `address` is that wallet.
   * Other addresses are left alone, so Faara never pays set-up costs for strangers.
   */
  async prepareOwnWallet(uid: string, address: string): Promise<void> {
    const profile = await this.deps.store.transaction((tx) =>
      tx.get<{ walletAddress?: string }>(`users/${uid}`),
    );
    if (profile?.walletAddress === address) await this.ensureUsdcAccount(address);
  }

  /**
   * Makes sure `owner` has a USDC account, creating it with Faara paying the small rent.
   * Circle can't pay that rent when it sends USDC to a wallet that never held any, so this
   * runs first for the person's own wallet. Waits until the account exists.
   */
  async ensureUsdcAccount(owner: string): Promise<void> {
    const { PublicKey, Transaction, TransactionInstruction } = solana();
    const { ataProgram, systemProgram, tokenProgram, usdcMint } = addresses();
    const ownerKey = new PublicKey(owner);
    const account = ata(ownerKey).toBase58();
    const existing = await this.rpc<{ value: unknown }>('getAccountInfo', [
      account,
      { encoding: 'base64', commitment: 'confirmed' },
    ]);
    if (existing.value) return;
    const keypair = await this.loadKeypair();
    await this.keepFunded(keypair.publicKey.toBase58()).catch(() => undefined);
    const { value } = await this.rpc<{ value: { blockhash: string } }>('getLatestBlockhash', [
      { commitment: 'confirmed' },
    ]);
    const tx = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: value.blockhash });
    tx.add(
      new TransactionInstruction({
        programId: ataProgram,
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: ata(ownerKey), isSigner: false, isWritable: true },
          { pubkey: ownerKey, isSigner: false, isWritable: false },
          { pubkey: usdcMint, isSigner: false, isWritable: false },
          { pubkey: systemProgram, isSigner: false, isWritable: false },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]), // create, or do nothing if it already exists
      }),
    );
    tx.sign(keypair);
    const signature = await this.rpc<string>('sendTransaction', [
      tx.serialize().toString('base64'),
      { encoding: 'base64', preflightCommitment: 'confirmed' },
    ]);
    for (let i = 0; i < 20; i++) {
      const { value: statuses } = await this.rpc<{
        value: ({ err: unknown; confirmationStatus?: string } | null)[];
      }>('getSignatureStatuses', [[signature]]);
      const status = statuses[0];
      if (status?.err) throw new ApiError('unavailable', 'Couldn’t set up your USDC account.');
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')
        return;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new ApiError('unavailable', 'Solana is slow right now. Try again in a minute.');
  }

  /**
   * Checks, co-signs and sends a USDC payment from the caller's own wallet (the address on
   * their profile, never one sent in the request). Returns the signature.
   */
  async sponsor(uid: string, encoded: string): Promise<string> {
    const { store, now } = this.deps;
    await consumeRate(store, now, uid, 'sponsor');
    const profile = await store.transaction((tx) =>
      tx.get<{ walletAddress?: string }>(`users/${uid}`),
    );
    const walletAddress = profile?.walletAddress;
    if (!walletAddress) {
      throw new ApiError('failed-precondition', 'Set up your dollar wallet first.');
    }
    const keypair = await this.loadKeypair();
    let tx: Transaction;
    try {
      tx = solana().Transaction.from(Buffer.from(encoded, 'base64'));
    } catch {
      throw new ApiError('invalid-argument', 'The payment couldn’t be read.');
    }
    checkSponsoredTransfer(tx, keypair.publicKey, new (solana().PublicKey)(walletAddress));
    tx.partialSign(keypair);
    await this.keepFunded(keypair.publicKey.toBase58()).catch(() => undefined);
    return this.rpc<string>('sendTransaction', [
      tx.serialize().toString('base64'),
      { encoding: 'base64', preflightCommitment: 'confirmed' },
    ]);
  }
}
