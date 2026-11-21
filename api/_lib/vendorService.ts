import { createHmac, randomBytes } from 'node:crypto';

import type {
  ApplicationForReview,
  VendorApplication,
  VendorApplicationInput,
  VendorProfile,
  VendorStatus,
} from '../../shared/vendors';

import { ApiError } from './errors';
import type { PushMessage } from './push';
import { consumeRate } from './rateLimit';
import type { DocumentStore } from './store';

interface ApplicationDoc extends VendorApplication {
  /** Keyed hash of the NIN, so one NIN can't open several vendor accounts. */
  ninHash: string;
}

interface ProfileDoc {
  fullName: string;
  username: string;
  phone?: string;
}

export interface VendorDeps {
  store: DocumentStore;
  now: () => number;
  /** Usernames of Faara’s team, who review applications (FAARA_ADMINS). */
  reviewers: readonly string[];
  notify?: (uid: string, message: PushMessage) => Promise<void>;
  /** Records each decision in the admin log. */
  audit?: (adminUid: string, action: string, targetUid: string, detail: string) => Promise<void>;
}

const applicationPath = (uid: string) => `vendorApplications/${uid}`;
const vendorPath = (uid: string) => `vendors/${uid}`;
const ninPath = (hash: string) => `vendorNins/${hash}`;
const saltPath = 'serverKeys/vendorNin';

/**
 * Vendor applications. A person applies with business details and their NIN; a reviewer
 * approves or rejects; an approved person becomes a vendor. The NIN itself is never stored:
 * only its last four digits (to show) and a keyed hash (to stop reuse). Checking the NIN
 * against the national register needs an identity provider and is the next step.
 */
export class VendorService {
  private salt?: Promise<string>;

  constructor(private readonly deps: VendorDeps) {}

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

  private async isReviewer(uid: string): Promise<boolean> {
    if (this.deps.reviewers.length === 0) return false;
    const me = await this.deps.store.transaction((tx) => tx.get<ProfileDoc>(`users/${uid}`));
    return Boolean(me && this.deps.reviewers.includes(me.username.toLowerCase()));
  }

  private async requireReviewer(uid: string): Promise<void> {
    if (!(await this.isReviewer(uid))) {
      throw new ApiError('permission-denied', 'Only Faara’s team can review vendors.');
    }
  }

  async status(uid: string): Promise<VendorStatus> {
    const { application, vendor } = await this.deps.store.transaction(async (tx) => ({
      application: await tx.get<ApplicationDoc>(applicationPath(uid)),
      vendor: await tx.get<VendorProfile>(vendorPath(uid)),
    }));
    let publicApplication: VendorApplication | null = null;
    if (application) {
      const { ninHash: _ninHash, ...rest } = application;
      publicApplication = rest;
    }
    return {
      application: publicApplication,
      vendor: vendor ?? null,
      isReviewer: await this.isReviewer(uid),
    };
  }

  async apply(uid: string, input: VendorApplicationInput): Promise<VendorStatus> {
    const { store, now } = this.deps;
    await consumeRate(store, now, uid, 'createHum');
    const ninHash = createHmac('sha256', await this.getSalt())
      .update(input.nin)
      .digest('hex');
    await store.transaction(async (tx) => {
      const profile = await tx.get<ProfileDoc>(`users/${uid}`);
      const existing = await tx.get<ApplicationDoc>(applicationPath(uid));
      const vendor = await tx.get<VendorProfile>(vendorPath(uid));
      const ninOwner = await tx.get<{ uid: string }>(ninPath(ninHash));
      if (!profile)
        throw new ApiError('failed-precondition', 'Finish creating your account first.');
      if (vendor) throw new ApiError('failed-precondition', 'You’re already a vendor.');
      if (existing?.status === 'pending') {
        throw new ApiError('failed-precondition', 'Your application is already being reviewed.');
      }
      if (ninOwner && ninOwner.uid !== uid) {
        throw new ApiError(
          'failed-precondition',
          'This NIN is already linked to another Faara vendor account.',
        );
      }
      tx.set(applicationPath(uid), {
        businessName: input.businessName,
        category: input.category,
        location: input.location,
        description: input.description,
        ninLast4: input.nin.slice(-4),
        ninHash,
        cacNumber: input.cacNumber,
        status: 'pending',
        submittedAt: now(),
        reviewedAt: null,
        reason: '',
      } satisfies ApplicationDoc);
      tx.set(ninPath(ninHash), { uid });
    });
    return this.status(uid);
  }

  /** Applications waiting for review, oldest first (reviewers only). */
  async pending(uid: string): Promise<ApplicationForReview[]> {
    await this.requireReviewer(uid);
    const rows = await this.deps.store.list<ApplicationDoc>('vendorApplications', {
      orderBy: 'submittedAt',
      limit: 100,
      oldestFirst: true,
    });
    const waiting = rows.filter((row) => row.data.status === 'pending');
    return Promise.all(
      waiting.map(async ({ id, data }) => {
        const profile = await this.deps.store.transaction((tx) =>
          tx.get<ProfileDoc>(`users/${id}`),
        );
        const { ninHash: _ninHash, ...rest } = data;
        return {
          ...rest,
          uid: id,
          applicant: {
            fullName: profile?.fullName ?? '',
            username: profile?.username ?? '',
            phone: profile?.phone ?? '',
          },
        };
      }),
    );
  }

  async review(
    reviewerUid: string,
    request: { uid: string; approve: boolean; reason: string },
  ): Promise<void> {
    const { store, now, notify } = this.deps;
    await this.requireReviewer(reviewerUid);
    const application = await store.transaction(async (tx) => {
      const current = await tx.get<ApplicationDoc>(applicationPath(request.uid));
      if (!current || current.status !== 'pending') {
        throw new ApiError('failed-precondition', 'That application isn’t waiting for review.');
      }
      const time = now();
      tx.update(applicationPath(request.uid), {
        status: request.approve ? 'approved' : 'rejected',
        reviewedAt: time,
        reason: request.approve ? '' : request.reason,
        reviewedBy: reviewerUid,
      });
      if (request.approve) {
        tx.set(vendorPath(request.uid), {
          businessName: current.businessName,
          category: current.category,
          location: current.location,
          approvedAt: time,
        } satisfies VendorProfile);
      }
      // A rejected applicant keeps their NIN link, so they can apply again with it.
      return current;
    });
    await this.deps.audit?.(
      reviewerUid,
      request.approve ? 'Approved vendor' : 'Rejected vendor',
      request.uid,
      request.approve ? application.businessName : `${application.businessName}: ${request.reason}`,
    );
    if (notify) {
      await notify(request.uid, {
        title: request.approve
          ? `${application.businessName} is now a Faara vendor`
          : 'Your vendor application needs changes',
        body: request.approve ? 'Open Faara to see your vendor dashboard.' : request.reason,
        data: { screen: 'vendor' },
      }).catch(() => undefined);
    }
  }
}
