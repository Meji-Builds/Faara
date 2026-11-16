/**
 * Static sample data for the design-stage UI.
 * Replaced by Firestore / wallet data from milestone 2 onward.
 */
import type { Currency } from '@/lib/money';

/** Account details that come from the BaaS partner and wallet in later milestones. */
export interface SampleAccounts {
  accountNumber: string;
  linkedBankLast4: string;
  solanaAddressShort: string;
}

export const sampleAccounts: SampleAccounts = {
  accountNumber: '012 345 6789',
  linkedBankLast4: '4521',
  solanaAddressShort: '7xKX…9fQa',
};

export const balances = {
  NGN: 184320,
  USDC: 212.4,
} satisfies Record<Currency, number>;

export type AvatarTone = 'soft' | 'gold' | 'surface';

export interface Transaction {
  id: string;
  counterparty: string;
  description: string;
  amount: number;
  currency: Currency;
  when: string;
  tone: AvatarTone;
  isMerchant?: boolean;
}

export const recentTransactions: Transaction[] = [
  {
    id: 'tx_1',
    counterparty: 'Tolu Adebayo',
    description: 'Hum · Suya & drinks',
    amount: -12500,
    currency: 'NGN',
    when: 'Today',
    tone: 'soft',
  },
  {
    id: 'tx_2',
    counterparty: 'Mama Nkechi Stores',
    description: 'Merchant hum',
    amount: -3200,
    currency: 'NGN',
    when: 'Today',
    tone: 'gold',
    isMerchant: true,
  },
  {
    id: 'tx_3',
    counterparty: 'Lumen Studio',
    description: 'Invoice paid · USDC',
    amount: 150,
    currency: 'USDC',
    when: 'Yesterday',
    tone: 'surface',
  },
  {
    id: 'tx_4',
    counterparty: 'Kola Musa',
    description: 'Bank transfer',
    amount: 5000,
    currency: 'NGN',
    when: 'Mon',
    tone: 'surface',
  },
];

/** Result of the wallet safety check (Webacy / DD.xyz, milestone 5). */
export type WalletRisk = { level: 'low'; history: string } | { level: 'warning'; reason: string };

export const freeTransfers = { used: 7, limit: 10 };
