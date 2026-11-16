import type { PaymentChannel } from '@shared/hum';

export const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  sound: 'Sound',
  bluetooth: 'Bluetooth',
  qr: 'QR code',
  manual: 'Typed code',
  username: 'Username',
};
