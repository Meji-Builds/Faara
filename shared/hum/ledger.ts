/** Mock naira ledger settings (until a BaaS partner is connected). */

/** Every mock account opens with this test balance, in kobo (₦200,000). */
export const MOCK_STARTING_BALANCE_KOBO = 20_000_000;

export interface ActivityEntry {
  direction: 'in' | 'out';
  kind: 'hum';
  paymentId: string;
  counterpartyName: string;
  counterpartyUsername: string;
  amountMinor: number;
  currency: 'NGN' | 'USDC';
  note: string;
  createdAt: number;
  /** Solana signature for USDC payments. */
  signature: string | null;
}
