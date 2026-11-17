/**
 * Minimal transactional document store. The hum service is written against this
 * interface so its rules can be tested without Firestore.
 *
 * As in Firestore, all reads in a transaction must happen before any writes.
 */
export interface StoreTransaction {
  get<T extends object>(path: string): Promise<T | undefined>;
  set(path: string, data: object): void;
  update(path: string, data: object): void;
}

export interface DocumentStore {
  transaction<R>(fn: (tx: StoreTransaction) => Promise<R>): Promise<R>;
  /** The id of the first document in `collection` whose `field` equals `value`. */
  findId(collection: string, field: string, value: string): Promise<string | undefined>;
}

/** In-memory store for tests. Transactions run one at a time and commit atomically. */
export class MemoryStore implements DocumentStore {
  readonly docs = new Map<string, object>();
  private queue: Promise<unknown> = Promise.resolve();

  async findId(collection: string, field: string, value: string): Promise<string | undefined> {
    for (const [path, doc] of this.docs) {
      const [name, id, ...rest] = path.split('/');
      if (
        name === collection &&
        id &&
        rest.length === 0 &&
        (doc as Record<string, unknown>)[field] === value
      )
        return id;
    }
    return undefined;
  }

  transaction<R>(fn: (tx: StoreTransaction) => Promise<R>): Promise<R> {
    const run = async () => {
      const writes = new Map<string, object>();
      const tx: StoreTransaction = {
        get: async <T extends object>(path: string) => {
          const doc = this.docs.get(path);
          return doc ? (structuredClone(doc) as T) : undefined;
        },
        set: (path, data) => void writes.set(path, structuredClone(data)),
        update: (path, data) => {
          const base = writes.get(path) ?? this.docs.get(path);
          if (!base) throw new Error(`update of missing document ${path}`);
          writes.set(path, { ...structuredClone(base), ...structuredClone(data) });
        },
      };
      const result = await fn(tx);
      for (const [path, data] of writes) this.docs.set(path, data);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
