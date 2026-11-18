import { createHash, randomBytes } from 'node:crypto';

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
  createTransaction(input: {
    walletId: string;
    tokenAddress: string;
    blockchain: typeof BLOCKCHAIN;
    amount: string[];
    destinationAddress: string;
    fee: { type: 'level'; config: { feeLevel: 'LOW' | 'MEDIUM' | 'HIGH' } };
    refId?: string;
    idempotencyKey?: string;
  }): Promise<{ data?: { id?: string } }>;
  getTransaction(input: { id: string }): Promise<{ data?: { transaction?: { state?: string } } }>;
}

/** Progress of a USDC transfer. */
export type TransferState = 'pending' | 'done' | 'failed';

const FAILED_STATES = new Set(['FAILED', 'DENIED', 'CANCELLED']);
/** Reserved wallet id for Faara's own USDC float. */
const TREASURY = '_treasury';

/** A stable UUID for a key, so a retried transfer is recognised and not sent twice. */
function idempotencyKey(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
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

  /** Whether this token is the configured setup token. */
  allowsSetup(token: string | null): boolean {
    return Boolean(this.deps.setupToken) && token === this.deps.setupToken;
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

  /** USDC held by the person's wallet, in cents. */
  async usdcCents(uid: string): Promise<number> {
    return Math.floor(Number((await this.info(uid)).usdc) * 100 + 1e-6);
  }

  /** Faara's own USDC float: the wallet conversions are paid from and into. */
  treasury(): Promise<WalletInfo> {
    return this.info(TREASURY);
  }

  /**
   * Moves USDC on the test network. A payout goes from Faara's float to the person; a
   * collect goes from the person to the float. The key makes retries safe: the same key
   * never moves money twice. Returns Circle's transaction id.
   */
  async send(kind: 'payout' | 'collect', uid: string, cents: number, key: string): Promise<string> {
    const client = await this.getClient();
    const [person, float] = await Promise.all([
      this.ensureWallet(uid),
      this.ensureWallet(TREASURY),
    ]);
    const [from, to] = kind === 'payout' ? [float, person] : [person, float];
    const result = await client.createTransaction({
      walletId: from.walletId,
      tokenAddress: USDC_DEVNET_MINT,
      blockchain: BLOCKCHAIN,
      amount: [(cents / 100).toFixed(2)],
      destinationAddress: to.address,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      refId: key,
      idempotencyKey: idempotencyKey(`${kind}:${key}`),
    });
    const id = result.data?.id;
    if (!id) throw new ApiError('internal', 'The USDC transfer didn’t start. Try again.');
    return id;
  }

  async transferState(id: string): Promise<TransferState> {
    const client = await this.getClient();
    const state = (await client.getTransaction({ id })).data?.transaction?.state ?? '';
    if (state === 'COMPLETE') return 'done';
    return FAILED_STATES.has(state) ? 'failed' : 'pending';
  }

  /**
   * One-time setup: makes an entity secret, registers it with Circle, and keeps it
   * server-side. Returns Circle's recovery file, which the owner must save: it is the only
   * way to recover the wallets if the secret is ever lost.
   */
  async setup(token: string | null): Promise<{ recoveryFile: string | null }> {
    const { apiKey, store, now, registerSecret } = this.deps;
    if (!apiKey) throw new ApiError('failed-precondition', 'Add the Circle API key first.');
    if (!this.allowsSetup(token)) {
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
