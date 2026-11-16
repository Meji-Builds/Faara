import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { receiptHtml, type ReceiptData } from './receiptHtml';

/** Renders the receipt to PDF and opens the share sheet (save to Files, WhatsApp, email…). */
export async function downloadReceipt(data: ReceiptData): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: receiptHtml(data) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Faara receipt ${data.reference}`,
    });
  } else {
    await Print.printAsync({ uri });
  }
}
