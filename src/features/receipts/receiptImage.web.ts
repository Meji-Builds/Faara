import { fonts, palette } from '@/theme';

import type { ReceiptData } from './receiptHtml';

const WIDTH = 720;
const PAD = 44;
const ROW = 64;

/** Draws the branded receipt on a canvas and returns it as a PNG. */
async function renderReceiptPng(data: ReceiptData): Promise<Blob> {
  const when = new Date(data.settledAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const rows: [string, string][] = [
    [
      data.direction === 'out' ? 'Paid to' : 'Received from',
      data.counterpartyUsername
        ? `${data.counterpartyName} (@${data.counterpartyUsername})`
        : data.counterpartyName,
    ],
    ['For', data.note || '—'],
    ['Date', when],
    ['Sent by', data.channelLabel],
    ['Fee', 'Free'],
    ['Network', data.currency === 'USDC' ? 'USDC on Solana (devnet)' : 'Naira'],
    ['Reference', data.reference],
  ];
  const top = 290;
  const height = top + rows.length * ROW + 90;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.scale(scale, scale);
  await document.fonts?.ready;

  // Card
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = palette.deepGreen;
  ctx.fillRect(0, 0, WIDTH, top);

  // Header
  ctx.fillStyle = palette.text;
  ctx.font = `36px ${fonts.display}`;
  ctx.fillText('fàárà', PAD, 76);
  ctx.fillStyle = palette.softTeal;
  ctx.font = `600 16px ${fonts.bodySemiBold}`;
  ctx.fillText(data.direction === 'out' ? 'PAYMENT SENT' : 'PAYMENT RECEIVED', PAD, 132);
  ctx.fillStyle = palette.text;
  ctx.font = `56px ${fonts.display}`;
  ctx.fillText(data.amountLabel, PAD, 196);
  ctx.fillStyle = palette.electricTeal;
  ctx.font = `22px ${fonts.bodySemiBold}`;
  ctx.fillText('Completed', PAD, 234);

  // Adire band: dots and dashes.
  ctx.fillStyle = '#1B6A55';
  for (let x = PAD; x < WIDTH - PAD; x += 26) {
    ctx.beginPath();
    ctx.arc(x + 3, top - 22, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 11, top - 23.5, 11, 3);
  }

  // Rows
  rows.forEach(([label, value], index) => {
    const y = top + index * ROW;
    ctx.fillStyle = '#E7F1EE';
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, 1);
    ctx.fillStyle = '#4E6B63';
    ctx.font = `20px ${fonts.body}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, PAD, y + 40);
    ctx.fillStyle = palette.nearBlack;
    ctx.font = label === 'Reference' ? `20px ${fonts.mono}` : `20px ${fonts.bodySemiBold}`;
    ctx.textAlign = 'right';
    ctx.fillText(value, WIDTH - PAD, y + 40, WIDTH - PAD * 2 - 170);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#4E6B63';
  ctx.font = `16px ${fonts.body}`;
  ctx.fillText('Test environment receipt · faara', PAD, top + rows.length * ROW + 48);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create image'))),
      'image/png',
    ),
  );
}

/** Web: shares the receipt image where the browser supports it, otherwise downloads it. */
export async function shareReceiptImage(data: ReceiptData): Promise<void> {
  const blob = await renderReceiptPng(data);
  const name = `faara-receipt-${data.reference}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Faara receipt ${data.reference}` });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
