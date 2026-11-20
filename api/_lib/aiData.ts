import { createHmac, randomBytes } from 'node:crypto';

import type { AssistantLanguage } from '../../shared/ai';

import { ApiError } from './errors';
import type { DocumentStore } from './store';

/**
 * Opt-in collection of AI examples, to train Faara's own models later. Nothing is kept
 * unless the person has said yes. Examples are stored with personal details already
 * removed and without the person's id: only a keyed hash of it, so their own feedback can
 * be matched and everything they gave can be deleted if they change their mind.
 */

export type ExampleTask = 'intent' | 'scam' | 'rule';

export interface ExampleDoc {
  task: ExampleTask;
  language: AssistantLanguage;
  /** What the person said or pasted, with personal details removed. */
  input: string;
  /** What the assistant answered (structured, no personal details). */
  output: Record<string, unknown>;
  /** The person's verdict on the answer, if they gave one. */
  feedback: 'good' | 'bad' | null;
  /** Keyed hash of the person's id. */
  owner: string;
  createdAt: number;
  /** Examples are deleted after this (set a Firestore TTL policy on this field). */
  expiresAt: number;
}

interface ConsentDoc {
  consent: boolean;
  updatedAt: number;
}

export interface AiDataDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
}

/** How long an example is kept. */
const RETENTION_MS = 2 * 365 * 86_400_000;
const consentPath = (uid: string) => `aiConsent/${uid}`;
const examplePath = (id: string) => `aiExamples/${id}`;
const saltPath = 'serverKeys/aiData';

export class AiData {
  private salt?: Promise<string>;

  constructor(private readonly deps: AiDataDeps) {}

  /** A secret kept server-side, so owner hashes can't be matched to ids without it. */
  private getSalt(): Promise<string> {
    this.salt ??= this.deps.store.transaction(async (tx) => {
      const saved = await tx.get<{ salt: string }>(saltPath);
      if (saved) return saved.salt;
      const salt = randomBytes(32).toString('hex');
      tx.set(saltPath, { salt, createdAt: this.deps.now() });
      return salt;
    });
    return this.salt;
  }

  private async owner(uid: string): Promise<string> {
    return createHmac('sha256', await this.getSalt())
      .update(uid)
      .digest('hex');
  }

  /** The person's choice: true, false, or null if they haven't been asked yet. */
  async consent(uid: string): Promise<boolean | null> {
    const doc = await this.deps.store.transaction((tx) => tx.get<ConsentDoc>(consentPath(uid)));
    return doc ? doc.consent : null;
  }

  /** Records the person's choice. Saying no deletes everything they gave before. */
  async setConsent(uid: string, consent: boolean): Promise<{ consent: boolean; deleted: number }> {
    const { store, now } = this.deps;
    await store.transaction(async (tx) => {
      tx.set(consentPath(uid), { consent, updatedAt: now() } satisfies ConsentDoc);
    });
    const deleted = consent
      ? 0
      : await store.deleteWhere('aiExamples', 'owner', await this.owner(uid));
    return { consent, deleted };
  }

  /** Keeps one example if the person agreed. Returns its id, or null. Never throws. */
  async record(
    uid: string,
    example: Pick<ExampleDoc, 'task' | 'language' | 'input' | 'output'>,
  ): Promise<string | null> {
    try {
      if ((await this.consent(uid)) !== true) return null;
      const { store, now, newId } = this.deps;
      const id = `EX${newId()}`;
      const createdAt = now();
      const doc: ExampleDoc = {
        ...example,
        input: example.input.slice(0, 4_000),
        feedback: null,
        owner: await this.owner(uid),
        createdAt,
        expiresAt: createdAt + RETENTION_MS,
      };
      await store.transaction(async (tx) => {
        tx.set(examplePath(id), doc);
      });
      return id;
    } catch (error) {
      // Collecting examples must never break the feature itself.
      console.error('Couldn’t keep an AI example', error);
      return null;
    }
  }

  /** The person's thumbs up or down on one of their examples. */
  async feedback(uid: string, id: string, good: boolean): Promise<void> {
    const owner = await this.owner(uid);
    await this.deps.store.transaction(async (tx) => {
      const doc = await tx.get<ExampleDoc>(examplePath(id));
      if (!doc || doc.owner !== owner) throw new ApiError('not-found', 'That answer wasn’t found.');
      tx.update(examplePath(id), { feedback: good ? 'good' : 'bad' });
    });
  }

  /** Examples for training, oldest first after `after`, without owner hashes. */
  async export(after: number, limit: number): Promise<{ examples: object[]; next: number | null }> {
    const page = await this.deps.store.list<ExampleDoc>('aiExamples', {
      orderBy: 'createdAt',
      limit,
      after,
      oldestFirst: true,
    });
    const examples = page.map(({ id, data }) => ({
      id,
      task: data.task,
      language: data.language,
      input: data.input,
      output: data.output,
      feedback: data.feedback,
      createdAt: data.createdAt,
    }));
    const last = examples.at(-1);
    return { examples, next: examples.length === limit && last ? last.createdAt : null };
  }
}
