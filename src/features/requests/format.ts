import type { RequestStatus } from '@shared/requests';

import { formatMoney } from '@/lib/money';

export const naira = (kobo: number) => formatMoney(kobo / 100, 'NGN');

export const STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Waiting',
  paid: 'Paid',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
