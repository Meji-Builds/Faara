import { postJson } from '@/lib/api/client';

export interface UsdcWalletStatus {
  configured: boolean;
  wallet: { address: string; usdc: string } | null;
}

/** The person's USDC wallet on the test network (created the first time it's asked for). */
export function getUsdcWallet() {
  return postJson<UsdcWalletStatus>('/api/wallet/status', {}, { retry: true });
}

/** USDC left in the wallet Faara used to hold for the person, in cents (0 if none). */
export function getLeftoverUsdc() {
  return postJson<{ cents: number }>('/api/wallet/leftover', {});
}
