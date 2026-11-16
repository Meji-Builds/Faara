import { USDC_MINT, centsToUsdcBaseUnits } from '../constants';
import { verifyTransfer, type ParsedTransaction } from '../verifyTransfer';

const SENDER = 'Sender1111111111111111111111111111111111111';
const RECIPIENT = 'Recip11111111111111111111111111111111111111';

function tx(
  senderBefore: bigint,
  senderAfter: bigint,
  recipientBefore: bigint | null,
  recipientAfter: bigint,
  err: unknown = null,
): ParsedTransaction {
  const entry = (owner: string, amount: bigint, mint = USDC_MINT) => ({
    owner,
    mint,
    uiTokenAmount: { amount: amount.toString() },
  });
  return {
    meta: {
      err,
      preTokenBalances: [
        entry(SENDER, senderBefore),
        ...(recipientBefore === null ? [] : [entry(RECIPIENT, recipientBefore)]),
      ],
      postTokenBalances: [entry(SENDER, senderAfter), entry(RECIPIENT, recipientAfter)],
    },
  };
}

const expected = {
  mint: USDC_MINT,
  senderOwner: SENDER,
  recipientOwner: RECIPIENT,
  amount: centsToUsdcBaseUnits(4050),
};

describe('verifyTransfer', () => {
  it('converts cents to USDC base units', () => {
    expect(centsToUsdcBaseUnits(4050)).toBe(40_500_000n);
  });

  it('accepts an exact transfer, including to a brand-new token account', () => {
    expect(verifyTransfer(tx(100_000_000n, 59_500_000n, 0n, 40_500_000n), expected)).toEqual({
      ok: true,
    });
    expect(verifyTransfer(tx(100_000_000n, 59_500_000n, null, 40_500_000n), expected)).toEqual({
      ok: true,
    });
  });

  it('rejects wrong amounts, failed transactions and missing data', () => {
    expect(verifyTransfer(tx(100_000_000n, 60_000_000n, 0n, 40_000_000n), expected).ok).toBe(false);
    expect(
      verifyTransfer(
        tx(100_000_000n, 59_500_000n, 0n, 40_500_000n, { InstructionError: [1, 'Custom'] }),
        expected,
      ).ok,
    ).toBe(false);
    expect(verifyTransfer(null, expected).ok).toBe(false);
  });

  it('rejects a transfer of a different token', () => {
    const fake = tx(100_000_000n, 59_500_000n, 0n, 40_500_000n);
    fake.meta!.postTokenBalances!.forEach(
      (b) => (b.mint = 'FakeMint11111111111111111111111111111111111'),
    );
    fake.meta!.preTokenBalances!.forEach(
      (b) => (b.mint = 'FakeMint11111111111111111111111111111111111'),
    );
    expect(verifyTransfer(fake, expected).ok).toBe(false);
  });

  it('rejects funds that came from someone other than the sender', () => {
    expect(verifyTransfer(tx(100_000_000n, 100_000_000n, 0n, 40_500_000n), expected).ok).toBe(
      false,
    );
  });
});
