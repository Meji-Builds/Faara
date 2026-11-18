import { parseWithdrawRequest } from '../withdraw';

const address = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

describe('parseWithdrawRequest', () => {
  it('accepts a sensible request', () => {
    expect(parseWithdrawRequest({ address, amountCents: 250, requestId: 'WDabcdefgh' })).toEqual({
      address,
      amountCents: 250,
      requestId: 'WDabcdefgh',
    });
  });

  it('rejects bad addresses, amounts and ids', () => {
    for (const bad of [
      { address: 'not-an-address', amountCents: 250, requestId: 'WDabcdefgh' },
      { address, amountCents: 0, requestId: 'WDabcdefgh' },
      { address, amountCents: 2.5, requestId: 'WDabcdefgh' },
      { address, amountCents: 500_001, requestId: 'WDabcdefgh' },
      { address, amountCents: 250, requestId: 'nope' },
      null,
    ]) {
      expect(() => parseWithdrawRequest(bad)).toThrow();
    }
  });
});
