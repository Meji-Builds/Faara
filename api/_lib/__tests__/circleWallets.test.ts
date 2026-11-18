import { ApiError } from '../errors';
import { CircleWallets, type WalletClient } from '../circleWallets';
import { MemoryStore } from '../store';

function fakeClient() {
  const calls = { sets: 0, wallets: 0 };
  const client: WalletClient = {
    createWalletSet: async () => {
      calls.sets++;
      return { data: { walletSet: { id: 'set1' } } };
    },
    createWallets: async () => {
      calls.wallets++;
      return { data: { wallets: [{ id: `w${calls.wallets}`, address: `Addr${calls.wallets}` }] } };
    },
    getWalletTokenBalance: async () => ({
      data: { tokenBalances: [{ amount: '12.5', token: { symbol: 'USDC' } }] },
    }),
  };
  return { client, calls };
}

function setup(overrides: Partial<ConstructorParameters<typeof CircleWallets>[0]> = {}) {
  const store = new MemoryStore();
  const { client, calls } = fakeClient();
  const registered: string[] = [];
  const wallets = new CircleWallets({
    store,
    now: () => 1000,
    apiKey: 'key',
    entitySecret: 'secret',
    setupToken: 'tok',
    makeClient: () => client,
    registerSecret: async (_k, secret) => {
      registered.push(secret);
      return 'recovery-file';
    },
    ...overrides,
  });
  return { store, wallets, calls, registered };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('CircleWallets', () => {
  it('is off without an API key', async () => {
    const { wallets } = setup({ apiKey: undefined });
    expect(wallets.configured).toBe(false);
    await expectApiError(wallets.info('ada'), 'failed-precondition');
  });

  it('makes one wallet set and one wallet per person, once', async () => {
    const { wallets, calls } = setup();
    const first = await wallets.ensureWallet('ada');
    const again = await wallets.ensureWallet('ada');
    await wallets.ensureWallet('tolu');
    expect(again).toEqual(first);
    expect(calls).toEqual({ sets: 1, wallets: 2 });
  });

  it('reports the address and USDC balance', async () => {
    const { wallets } = setup();
    expect(await wallets.info('ada')).toEqual({ address: 'Addr1', usdc: '12.5' });
  });

  it('needs the one-time setup when no entity secret exists', async () => {
    const { wallets } = setup({ entitySecret: undefined });
    await expectApiError(wallets.info('ada'), 'failed-precondition');
  });

  describe('setup', () => {
    it('refuses a wrong or missing token', async () => {
      const { wallets } = setup({ entitySecret: undefined });
      await expectApiError(wallets.setup('nope'), 'permission-denied');
      await expectApiError(wallets.setup(null), 'permission-denied');
      const noToken = setup({ entitySecret: undefined, setupToken: undefined });
      await expectApiError(noToken.wallets.setup('anything'), 'permission-denied');
    });

    it('registers a secret once, keeps it, and returns the recovery file', async () => {
      const { wallets, store, registered } = setup({ entitySecret: undefined });
      const result = await wallets.setup('tok');
      expect(result.recoveryFile).toBe('recovery-file');
      expect(registered[0]).toMatch(/^[0-9a-f]{64}$/);
      expect((store.docs.get('serverKeys/circle') as { entitySecret: string }).entitySecret).toBe(
        registered[0],
      );
      await expectApiError(wallets.setup('tok'), 'failed-precondition');
      // After setup the saved secret lets wallets work.
      expect((await wallets.info('ada')).address).toBe('Addr1');
    });
  });
});
