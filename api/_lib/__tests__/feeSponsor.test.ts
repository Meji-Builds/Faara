import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

import { USDC_MINT } from '../../../shared/solana';
import {
  associatedTokenAddress,
  buildSponsoredUsdcTransfer,
  createAtaIdempotentInstruction,
  transferCheckedInstruction,
} from '../../../src/features/wallet/solana';
import { ApiError } from '../errors';
import { checkSponsoredTransfer, FeeSponsor } from '../feeSponsor';
import { MemoryStore } from '../store';

const BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';

const sponsor = Keypair.generate();
const sender = Keypair.generate();
const recipient = Keypair.generate().publicKey;
const usdc = new PublicKey(USDC_MINT);

const legit = () =>
  buildSponsoredUsdcTransfer(sender, recipient, 2_500_000n, BLOCKHASH, sponsor.publicKey);

/** Rebuilds a transaction from parts and has `signers` sign it. */
function build(
  instructions: Transaction['instructions'],
  signers: Keypair[],
  feePayer = sponsor.publicKey,
): Transaction {
  const tx = new Transaction({ feePayer, recentBlockhash: BLOCKHASH });
  tx.add(...instructions);
  if (signers.length > 0) tx.partialSign(...signers);
  return tx;
}

const refused = (tx: Transaction, owner = sender.publicKey) =>
  expect(() => checkSponsoredTransfer(tx, sponsor.publicKey, owner)).toThrow(ApiError);

describe('which payments Faara pays the fee for', () => {
  it('accepts a plain USDC payment from the sender’s own wallet', () => {
    const checked = checkSponsoredTransfer(legit(), sponsor.publicKey, sender.publicKey);
    expect(checked.amount).toBe(2_500_000n);
    expect(checked.recipient?.equals(recipient)).toBe(true);
    // Without the account set-up step too.
    const plain = build([transferCheckedInstruction(sender.publicKey, recipient, 1n)], [sender]);
    expect(checkSponsoredTransfer(plain, sponsor.publicKey, sender.publicKey).amount).toBe(1n);
  });

  it('refuses a payment from someone else’s wallet', () => {
    refused(legit(), Keypair.generate().publicKey);
  });

  it('refuses anything that would move the sponsor’s own money', () => {
    // USDC out of the sponsor's account.
    refused(
      build([transferCheckedInstruction(sponsor.publicKey, recipient, 5n)], []),
      sponsor.publicKey,
    );
    // An extra SOL transfer from the sponsor tucked in after the payment.
    const tx = legit();
    refused(
      build(
        [
          ...tx.instructions,
          SystemProgram.transfer({
            fromPubkey: sponsor.publicKey,
            toPubkey: recipient,
            lamports: 1_000_000,
          }),
        ],
        [sender],
      ),
    );
  });

  it('refuses other tokens, other programs, wrong fee payers and missing signatures', () => {
    const fakeMint = Keypair.generate().publicKey;
    refused(
      build([transferCheckedInstruction(sender.publicKey, recipient, 5n, fakeMint)], [sender]),
    );
    refused(
      build(
        [
          SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: recipient,
            lamports: 5,
          }),
        ],
        [sender],
      ),
    );
    refused(
      build(
        [transferCheckedInstruction(sender.publicKey, recipient, 5n)],
        [sender],
        sender.publicKey,
      ),
    );
    refused(build([transferCheckedInstruction(sender.publicKey, recipient, 5n)], []));
    // Account set-up paid by someone else, or for a different account than the payment's.
    refused(
      build(
        [
          createAtaIdempotentInstruction(sender.publicKey, recipient),
          transferCheckedInstruction(sender.publicKey, recipient, 5n),
        ],
        [sender],
      ),
    );
    refused(
      build(
        [
          createAtaIdempotentInstruction(sponsor.publicKey, recipient),
          transferCheckedInstruction(sender.publicKey, Keypair.generate().publicKey, 5n),
        ],
        [sender],
      ),
    );
  });

  it('refuses a payment changed after it was signed', () => {
    const tx = legit();
    const transfer = tx.instructions[1];
    if (!transfer) throw new Error('missing');
    const data = Buffer.from(transfer.data);
    data.writeBigUInt64LE(9_999_999_999n, 1);
    transfer.data = data;
    refused(tx);
  });

  it('only ever uses the mint and accounts it expects', () => {
    expect(associatedTokenAddress(recipient).equals(associatedTokenAddress(recipient, usdc))).toBe(
      true,
    );
  });
});

describe('the fee sponsor service', () => {
  function setup(walletAddress?: string) {
    const store = new MemoryStore();
    store.docs.set('users/ada', { fullName: 'Ada', username: 'ada', walletAddress });
    const calls: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      calls.push(method);
      const result =
        method === 'getBalance'
          ? { value: 1_000_000_000 }
          : method === 'sendTransaction'
            ? 'SIGNATURE'
            : null;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
    }) as typeof fetch;
    const service = new FeeSponsor({
      store,
      now: () => 1_000,
      secretKey: Buffer.from(sponsor.secretKey).toString('base64'),
      fetch: fakeFetch,
      rpcUrl: 'http://rpc.test',
    });
    return { service, calls };
  }

  const encode = (tx: Transaction) =>
    tx.serialize({ requireAllSignatures: false }).toString('base64');

  it('co-signs and sends a payment from the wallet on the caller’s profile', async () => {
    const { service, calls } = setup(sender.publicKey.toBase58());
    expect(await service.address()).toBe(sponsor.publicKey.toBase58());
    expect(await service.sponsor('ada', encode(legit()))).toBe('SIGNATURE');
    expect(calls).toContain('sendTransaction');
  });

  it('won’t pay for a wallet that isn’t the caller’s', async () => {
    const { service, calls } = setup(Keypair.generate().publicKey.toBase58());
    await expect(service.sponsor('ada', encode(legit()))).rejects.toBeInstanceOf(ApiError);
    const noWallet = setup(undefined);
    await expect(noWallet.service.sponsor('ada', encode(legit()))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(calls).not.toContain('sendTransaction');
  });

  it('keeps a key of its own when none is configured', async () => {
    const store = new MemoryStore();
    const service = new FeeSponsor({ store, now: () => 1, secretKey: null });
    const address = await service.address();
    expect(store.docs.get('serverKeys/feePayer')).toBeTruthy();
    const again = new FeeSponsor({ store, now: () => 2, secretKey: null });
    expect(await again.address()).toBe(address);
  });
});
