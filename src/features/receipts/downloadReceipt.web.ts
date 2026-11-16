import { receiptHtml, type ReceiptData } from './receiptHtml';

/**
 * Web: opens the receipt in a print dialog, where "Save as PDF" downloads it. Uses a hidden
 * iframe so the app page itself isn't printed.
 */
export async function downloadReceipt(data: ReceiptData): Promise<void> {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    throw new Error('Could not open the receipt');
  }
  doc.open();
  doc.write(receiptHtml(data));
  doc.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
