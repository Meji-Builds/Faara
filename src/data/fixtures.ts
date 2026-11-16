/**
 * Static sample data for the design-stage UI.
 * Replaced by Firestore / wallet data from milestone 2 onward.
 */
import type { Currency } from '@/lib/money';
import type { BrandShape } from '@/components/brand/ShapeGlyph';

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

export type WalletRisk = { level: 'low'; history: string } | { level: 'warning'; reason: string };

export interface Claimant {
  id: string;
  name: string;
  firstName: string;
  username: string;
  /** Estimated distance in centimetres. */
  distanceCm: number;
  tone: AvatarTone;
  risk: WalletRisk;
}

/** Ordered closest first, as the backend will return them. */
export const sampleClaimants: Claimant[] = [
  {
    id: 'claim_tolu',
    name: 'Tolu Adebayo',
    firstName: 'Tolu',
    username: 'tolu.a',
    distanceCm: 20,
    tone: 'soft',
    risk: { level: 'low', history: 'Paid 4× before' },
  },
  {
    id: 'claim_kola',
    name: 'Kola Musa',
    firstName: 'Kola',
    username: 'kolamusa',
    distanceCm: 110,
    tone: 'gold',
    risk: { level: 'warning', reason: 'New wallet · 3 days old' },
  },
];

/** Phones that decoded the hum but were filtered out as too far away. */
export const outOfRangeClaims = 1;

export const sampleMatchShapes: [BrandShape, BrandShape, BrandShape] = [
  'triangle',
  'ring',
  'diamond',
];

export const freeTransfers = { used: 7, limit: 10 };
