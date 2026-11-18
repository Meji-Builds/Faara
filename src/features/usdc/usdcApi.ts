import { postJson } from '@/lib/api/client';

export interface UsdcWalletStatus {
  configured: boolean;
  wallet: { address: string; usdc: string } | null;
}

/** The person's USDC wallet on the test network (created the first time it's asked for). */
export function getUsdcWallet() {
  return postJson<UsdcWalletStatus>('/api/wallet/status', {}, { retry: true });
}
