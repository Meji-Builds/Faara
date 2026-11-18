import type { PaymentChannel } from '@shared/hum';

export const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  sound: 'Sound',
  bluetooth: 'Bluetooth',
  qr: 'Hum ring',
  manual: 'Typed code',
  username: 'Username',
  offline: 'Offline pocket',
};
