import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';

import { centsToUsdcBaseUnits } from '@shared/solana';

import {
  createAtaIdempotentInstruction,
  latestBlockhash,
  transferCheckedInstruction,
} from '@/features/wallet/solana';
import { PRODUCTION_URL } from '@/lib/api/client';

import type { ConnectedWallet } from './types';

/** Phantom, Solflare, Seed Vault and other Android wallets speak Mobile Wallet Adapter. */
export const MOBILE_WALLETS_SUPPORTED = Platform.OS === 'android';

const CHAIN = 'solana:devnet';
const IDENTITY = { name: 'Faara', uri: PRODUCTION_URL, icon: 'favicon.ico' };

/** Wallets return addresses as base64 bytes; Faara shows the usual base58 form. */
function toBase58(address: string): string {
  return new PublicKey(Buffer.from(address, 'base64')).toBase58();
}

/** Opens the person's Solana wallet app and asks to connect. */
export async function connectMobileWallet(): Promise<ConnectedWallet> {
  return transact(async (wallet) => {
    const auth = await wallet.authorize({ chain: CHAIN, identity: IDENTITY });
    const account = auth.accounts[0];
    if (!account) throw new Error('The wallet didn’t share an account.');
    return {
      address: toBase58(account.address),
      label: 'label' in account && account.label ? account.label : 'Solana wallet',
      authToken: auth.auth_token,
    };
  });
}

/**
 * Moves USDC from the connected wallet into the person's Faara wallet. The wallet app shows
 * the transfer and signs it; Faara never sees its keys. Returns the transaction signature.
 */
export async function depositFromMobileWallet(
  connected: ConnectedWallet,
  faaraAddress: string,
  cents: number,
): Promise<string> {
  const from = new PublicKey(connected.address);
  const to = new PublicKey(faaraAddress);
  const transaction = new Transaction({ feePayer: from, recentBlockhash: await latestBlockhash() });
  transaction.add(
    createAtaIdempotentInstruction(from, to),
    transferCheckedInstruction(from, to, centsToUsdcBaseUnits(cents)),
  );
  const [signature] = await transact(async (wallet) => {
    await wallet.authorize({ chain: CHAIN, identity: IDENTITY, auth_token: connected.authToken });
    return wallet.signAndSendTransactions({ transactions: [transaction] });
  });
  if (!signature) throw new Error('The wallet didn’t send the transfer.');
  return signature;
}
