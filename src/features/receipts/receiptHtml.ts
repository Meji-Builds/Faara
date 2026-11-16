/** Branded, self-contained HTML for a payment receipt (rendered to PDF). */

export interface ReceiptData {
  reference: string;
  direction: 'in' | 'out';
  amountLabel: string;
  counterpartyName: string;
  counterpartyUsername: string;
  note: string;
  settledAt: number;
  channelLabel: string;
  currency: 'NGN' | 'USDC';
  /** Solana explorer link for USDC payments. */
  explorerUrl: string | null;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** "AbC123xyz…" → "HUM-ABC1-23XY": short, readable reference from a payment id. */
export function receiptReference(paymentId: string): string {
  const clean = paymentId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `HUM-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

export function receiptHtml(data: ReceiptData): string {
  const when = new Date(data.settledAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const party = data.direction === 'out' ? 'Paid to' : 'Received from';
  const rows: [string, string][] = [
    [party, `${data.counterpartyName} (@${data.counterpartyUsername})`],
    ['For', data.note || '—'],
    ['Date', when],
    ['Sent by', data.channelLabel],
    ['Fee', 'Free'],
    ['Network', data.currency === 'USDC' ? 'USDC on Solana (devnet)' : 'Naira'],
    ['Reference', data.reference],
  ];
  const band = Array.from({ length: 28 }, () => '<i></i><b></b>').join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Faara receipt ${escapeHtml(data.reference)}</title>
<style>
  @page { margin: 24px; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #0A1412; background: #fff; }
  .card { max-width: 520px; margin: 0 auto; border-radius: 24px; overflow: hidden; border: 1px solid #DCE9E4; }
  .top { background: #0B3D2E; color: #EAF7F2; padding: 28px 28px 22px; }
  .brand { font-weight: 800; font-size: 26px; letter-spacing: -0.5px; }
  .label { color: #A8F0E1; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; margin-top: 22px; }
  .amount { font-weight: 800; font-size: 40px; letter-spacing: -1.5px; margin-top: 6px; }
  .status { color: #14E0C1; font-weight: 600; margin-top: 6px; }
  .band { display: flex; gap: 6px; align-items: center; padding: 10px 28px; background: #0B3D2E; overflow: hidden; }
  .band i, .band b { flex-shrink: 0; }
  .band i { width: 5px; height: 5px; border-radius: 50%; background: #1B6A55; display: block; }
  .band b { width: 12px; height: 2px; border-radius: 1px; background: #1B6A55; display: block; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 14px 28px; border-top: 1px solid #E7F1EE; font-size: 14px; vertical-align: top; }
  td.k { color: #4E6B63; width: 38%; }
  td.v { text-align: right; font-weight: 600; word-break: break-word; }
  .mono { font-family: 'JetBrains Mono', Menlo, monospace; font-weight: 500; }
  .foot { padding: 18px 28px 26px; color: #4E6B63; font-size: 12px; line-height: 1.5; border-top: 1px solid #E7F1EE; }
  a { color: #0B7A64; }
</style></head>
<body><div class="card">
  <div class="top">
    <div class="brand">fàárà</div>
    <div class="label">${data.direction === 'out' ? 'Payment sent' : 'Payment received'}</div>
    <div class="amount">${escapeHtml(data.amountLabel)}</div>
    <div class="status">Completed</div>
  </div>
  <div class="band">${band}</div>
  <table>${rows
    .map(
      ([k, v]) =>
        `<tr><td class="k">${escapeHtml(k)}</td><td class="v${k === 'Reference' ? ' mono' : ''}">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>
  <div class="foot">
    ${data.explorerUrl ? `On-chain record: <a href="${escapeHtml(data.explorerUrl)}">${escapeHtml(data.explorerUrl)}</a><br/>` : ''}
    Test environment receipt. Keep this reference if you contact Faara support.
  </div>
</div></body></html>`;
}
