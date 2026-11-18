import { randomBytes } from 'node:crypto';

import { ApiError } from './errors';
import type { DocumentStore } from './store';

/** The one blockchain and token this uses: USDC on Solana's test network. */
const BLOCKCHAIN = 'SOL-DEVNET' as const;
const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/** The slice of Circle's SDK this service needs, so tests can stand in for it. */
export interface WalletClient {
  createWalletSet(input: { name: string }): Promise<{ data?: { walletSet?: { id: string } } }>;
  createWallets(input: {
    blockchains: (typeof BLOCKCHAIN)[];
    count: number;
    walletSetId: string;
    metadata?: { refId?: string }[];
  }): Promise<{ data?: { wallets?: { id: string; address: string }[] } }>;
  getWalletTokenBalance(input: { id: string }): Promise<{
    data?: {
      tokenBalances?: { amount: string; token: { symbol?: string; tokenAddress?: string } }[];
    };
  }>;
}

export interface CircleDeps {
  store: DocumentStore;
  now: () => number;
  /** CIRCLE_API_KEY. Without it the feature is switched off. */
  apiKey: string | undefined;
  /** CIRCLE_ENTITY_SECRET, if you registered one yourself in Circle's console. */
  entitySecret?: string | undefined;
  /** CIRCLE_SETUP_TOKEN, which allows the one-time setup route. */
  setupToken?: string | undefined;
  makeClient: (apiKey: string, entitySecret: string) => WalletClient;
  /** Registers a new entity secret with Circle and returns its recovery file. */
  registerSecret: (apiKey: string, entitySecret: string) => Promise<string | null>;
}

export interface WalletInfo {
  address: string;
  /** USDC held, as a decimal string like "12.5". */
  usdc: string;
}

const secretPath = 'serverKeys/circle';
const setPath = 'serverKeys/circleWalletSet';
const walletPath = (uid: string) => `circleWallets/${uid}`;

/**
 * USDC wallets on Solana's test network, created and held through Circle. Wallets are made
 * the first time someone asks for theirs. This is test-network only and custodial: Faara,
 * through Circle, controls the keys. Decide the custody model with counsel before launch.
 */
export class CircleWallets {
  private client?: Promise<WalletClient>;

  constructor(private readonly deps: CircleDeps) {}

  get configured(): boolean {
    return Boolean(this.deps.apiKey);
  }

  private async entitySecret(): Promise<string | null> {
    if (this.deps.entitySecret) return this.deps.entitySecret;
    const saved = await this.deps.store.transaction((tx) =>
      tx.get<{ entitySecret: string }>(secretPath),
    );
    return saved?.entitySecret ?? null;
  }

  private getClient(): Promise<WalletClient> {
    if (!this.deps.apiKey) {
      throw new ApiError('failed-precondition', 'Dollar wallets aren’t switched on yet.');
    }
    const apiKey = this.deps.apiKey;
    this.client ??= (async () => {
      const secret = await this.entitySecret();
      if (!secret) {
        throw new ApiError(
          'failed-precondition',
          'Dollar wallets still need their one-time setup.',
        );
      }
      return this.deps.makeClient(apiKey, secret);
    })();
    return this.client;
  }

  /** The wallet set every wallet belongs to, created once. */
  private async walletSetId(client: WalletClient): Promise<string> {
    const saved = await this.deps.store.transaction((tx) => tx.get<{ id: string }>(setPath));
    if (saved) return saved.id;
    const created = await client.createWalletSet({ name: 'Faara wallets' });
    const id = created.data?.walletSet?.id;
    if (!id) throw new ApiError('internal', 'Couldn’t set up wallets. Try again.');
    // If two requests race, the first saved set wins and the other is simply unused.
    return this.deps.store.transaction(async (tx) => {
      const existing = await tx.get<{ id: string }>(setPath);
      if (existing) return existing.id;
      tx.set(setPath, { id, createdAt: this.deps.now() });
      return id;
    });
  }

  /** The person's wallet, created on first use. */
  async ensureWallet(uid: string): Promise<{ walletId: string; address: string }> {
    const client = await this.getClient();
    const saved = await this.deps.store.transaction((tx) =>
      tx.get<{ walletId: string; address: string }>(walletPath(uid)),
    );
    if (saved) return { walletId: saved.walletId, address: saved.address };
    const walletSetId = await this.walletSetId(client);
    const created = await client.createWallets({
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId,
      metadata: [{ refId: uid }],
    });
    const wallet = created.data?.wallets?.[0];
    if (!wallet) throw new ApiError('internal', 'Couldn’t create your wallet. Try again.');
    return this.deps.store.transaction(async (tx) => {
      const existing = await tx.get<{ walletId: string; address: string }>(walletPath(uid));
      if (existing) return { walletId: existing.walletId, address: existing.address };
      const record = { walletId: wallet.id, address: wallet.address };
      tx.set(walletPath(uid), { ...record, createdAt: this.deps.now() });
      return record;
    });
  }

  /** The person's wallet address and USDC balance. */
  async info(uid: string): Promise<WalletInfo> {
    const client = await this.getClient();
    const { walletId, address } = await this.ensureWallet(uid);
    const balances = await client.getWalletTokenBalance({ id: walletId });
    const usdc = balances.data?.tokenBalances?.find(
      (b) => b.token.symbol === 'USDC' || b.token.tokenAddress === USDC_DEVNET_MINT,
    );
    return { address, usdc: usdc?.amount ?? '0' };
  }

  /**
   * One-time setup: makes an entity secret, registers it with Circle, and keeps it
   * server-side. Returns Circle's recovery file, which the owner must save: it is the only
   * way to recover the wallets if the secret is ever lost.
   */
  async setup(token: string | null): Promise<{ recoveryFile: string | null }> {
    const { apiKey, setupToken, store, now, registerSecret } = this.deps;
    if (!apiKey) throw new ApiError('failed-precondition', 'Add the Circle API key first.');
    if (!setupToken || token !== setupToken) {
      throw new ApiError('permission-denied', 'Setup isn’t allowed from here.');
    }
    if (this.deps.entitySecret || (await this.entitySecret())) {
      throw new ApiError('failed-precondition', 'Setup has already been done.');
    }
    const secret = randomBytes(32).toString('hex');
    const recoveryFile = await registerSecret(apiKey, secret);
    await store.transaction(async (tx) => {
      tx.set(secretPath, { entitySecret: secret, createdAt: now() });
    });
    return { recoveryFile };
  }
}
