import { receiptHtml, receiptReference } from '../receiptHtml';

describe('receipt HTML', () => {
  const base = {
    reference: receiptReference('aB3-xY9qZ_12'),
    direction: 'out' as const,
    amountLabel: '₦12,500',
    counterpartyName: 'Tolu Adebayo',
    counterpartyUsername: 'tolu.a',
    note: 'Suya & drinks',
    settledAt: Date.UTC(2026, 10, 16, 18, 0),
    channelLabel: 'Sound',
    currency: 'NGN' as const,
    explorerUrl: null,
  };

  it('builds a readable reference', () => {
    expect(base.reference).toBe('HUM-AB3X-Y9QZ');
  });

  it('includes the payment details and escapes user text', () => {
    const html = receiptHtml({ ...base, note: '<script>alert(1)</script>' });
    expect(html).toContain('₦12,500');
    expect(html).toContain('Paid to');
    expect(html).toContain('Tolu Adebayo (@tolu.a)');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('links USDC receipts to the explorer', () => {
    const html = receiptHtml({
      ...base,
      currency: 'USDC',
      explorerUrl: 'https://explorer.solana.com/tx/abc?cluster=devnet',
    });
    expect(html).toContain('explorer.solana.com/tx/abc');
    expect(html).toContain('USDC on Solana (devnet)');
  });
});
