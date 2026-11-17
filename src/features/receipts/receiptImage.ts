import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import type { ViewRef } from '@/lib/viewRef';

import type { ReceiptData } from './receiptHtml';

/** Captures the on-screen receipt as a PNG and opens the share sheet (gallery, WhatsApp…). */
export async function shareReceiptImage(data: ReceiptData, view: ViewRef): Promise<void> {
  if (!view.current) throw new Error('Receipt is not on screen');
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: `Faara receipt ${data.reference}`,
  });
}
