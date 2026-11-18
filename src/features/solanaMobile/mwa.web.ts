import type { ConnectedWallet } from './types';

/** Mobile Wallet Adapter needs the Android app; on the web, send to a pasted address instead. */
export const MOBILE_WALLETS_SUPPORTED = false;

const unavailable = () => new Error('Connect a wallet from the Faara Android app.');

export async function connectMobileWallet(): Promise<ConnectedWallet> {
  throw unavailable();
}

export async function depositFromMobileWallet(
  _connected: ConnectedWallet,
  _faaraAddress: string,
  _cents: number,
): Promise<string> {
  throw unavailable();
}
