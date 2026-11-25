import type { ActivityEntry } from '@shared/hum';
import { explorerTxUrl } from '@shared/solana';

import { formatMoney } from '@/lib/money';

import { CHANNEL_LABEL } from './channelLabels';
import { receiptReference, type ReceiptData } from './receiptHtml';

/** Receipt data for a settled payment from the activity feed. */
export function receiptFromActivity(entry: ActivityEntry): ReceiptData {
  return {
    reference: receiptReference(entry.paymentId),
    direction: entry.direction,
    amountLabel: formatMoney(entry.amountMinor / 100, entry.currency, {
      decimals: entry.currency === 'USDC' ? 2 : undefined,
    }),
    counterpartyName: entry.counterpartyName,
    counterpartyUsername: entry.counterpartyUsername,
    note: entry.note,
    settledAt: entry.createdAt,
    channelLabel:
      entry.kind === 'deposit'
        ? 'Card or bank transfer'
        : entry.kind === 'refund'
          ? 'Refund by Faara after a dispute'
          : CHANNEL_LABEL[entry.channel ?? (entry.kind === 'transfer' ? 'username' : 'sound')],
    currency: entry.currency,
    explorerUrl: entry.signature ? explorerTxUrl(entry.signature) : null,
  };
}
