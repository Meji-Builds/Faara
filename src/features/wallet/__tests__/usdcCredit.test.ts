import { USDC_MINT } from '@shared/solana';

import { usdcCreditFrom } from '../solana';

const balance = (accountIndex: number, owner: string, amount: string, mint = USDC_MINT) => ({
  accountIndex,
  mint,
  owner,
  uiTokenAmount: { amount },
});

describe('reading USDC that arrived in a wallet', () => {
  it('finds the amount received and who paid it', () => {
    const credit = usdcCreditFrom('SHOP', {
      preTokenBalances: [balance(1, 'PAYER', '5000000'), balance(2, 'SHOP', '1000000')],
      postTokenBalances: [balance(1, 'PAYER', '2500000'), balance(2, 'SHOP', '3500000')],
    });
    expect(credit).toEqual({ cents: 250, from: 'PAYER' });
  });

  it('counts a brand-new token account, and ignores other tokens and money going out', () => {
    expect(
      usdcCreditFrom('SHOP', {
        preTokenBalances: [balance(1, 'PAYER', '900000')],
        postTokenBalances: [balance(1, 'PAYER', '0'), balance(2, 'SHOP', '900000')],
      }),
    ).toEqual({ cents: 90, from: 'PAYER' });
    expect(
      usdcCreditFrom('SHOP', {
        preTokenBalances: [balance(2, 'SHOP', '0', 'OTHERMINT')],
        postTokenBalances: [balance(2, 'SHOP', '9000000', 'OTHERMINT')],
      }),
    ).toBeNull();
    expect(
      usdcCreditFrom('SHOP', {
        preTokenBalances: [balance(2, 'SHOP', '3000000')],
        postTokenBalances: [balance(2, 'SHOP', '1000000')],
      }),
    ).toBeNull();
  });
});
