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

/** An equality filter on one field. */
export interface Where {
  field: string;
  equals: string | number | boolean;
}

export interface ListOptions {
  orderBy: string;
  limit: number;
  after?: number;
  oldestFirst?: boolean;
  /** Only documents where `field` equals the value. */
  where?: Where;
}

export interface DocumentStore {
  transaction<R>(fn: (tx: StoreTransaction) => Promise<R>): Promise<R>;
  /** The id of the first document in `collection` whose `field` equals `value`. */
  findId(collection: string, field: string, value: string): Promise<string | undefined>;
  /**
   * Up to `limit` documents of a collection ordered by the numeric field `orderBy` (newest
   * first unless `oldestFirst`), optionally only those whose `orderBy` is greater than
   * `after`. Not transactional.
   */
  list<T extends object>(
    collection: string,
    options: ListOptions,
  ): Promise<{ id: string; data: T }[]>;
  /** How many documents a collection holds, optionally only those matching `where`. */
  count(collection: string, where?: Where): Promise<number>;
  /** Deletes every document in `collection` whose `field` equals `value`; returns how many. */
  deleteWhere(collection: string, field: string, value: string): Promise<number>;
}

function matches(doc: object, where: Where | undefined): boolean {
  return !where || (doc as Record<string, unknown>)[where.field] === where.equals;
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

  async list<T extends object>(
    collection: string,
    options: ListOptions,
  ): Promise<{ id: string; data: T }[]> {
    const depth = collection.split('/').length + 1;
    const value = (doc: object) => Number((doc as Record<string, unknown>)[options.orderBy] ?? 0);
    return [...this.docs]
      .filter(([path]) => path.startsWith(`${collection}/`) && path.split('/').length === depth)
      .filter(([, doc]) => options.after === undefined || value(doc) > options.after)
      .filter(([, doc]) => matches(doc, options.where))
      .sort(([, a], [, b]) => (options.oldestFirst ? value(a) - value(b) : value(b) - value(a)))
      .slice(0, options.limit)
      .map(([path, doc]) => ({ id: path.split('/').pop() ?? '', data: structuredClone(doc) as T }));
  }

  async count(collection: string, where?: Where): Promise<number> {
    const depth = collection.split('/').length + 1;
    return [...this.docs].filter(
      ([path, doc]) =>
        path.startsWith(`${collection}/`) &&
        path.split('/').length === depth &&
        matches(doc, where),
    ).length;
  }

  async deleteWhere(collection: string, field: string, value: string): Promise<number> {
    let count = 0;
    for (const [path, doc] of [...this.docs]) {
      const parts = path.split('/');
      if (
        parts.length === 2 &&
        parts[0] === collection &&
        (doc as Record<string, unknown>)[field] === value
      ) {
        this.docs.delete(path);
        count++;
      }
    }
    return count;
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
