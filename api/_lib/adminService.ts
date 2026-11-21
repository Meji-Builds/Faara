import type {
  AdminLogEntry,
  AdminOverview,
  AdminPayment,
  AdminUserDetail,
  AdminUserSummary,
} from '../../shared/admin';
import { MOCK_STARTING_BALANCE_KOBO, type ActivityEntry } from '../../shared/hum';
import type { SupportTicket } from '../../shared/support';
import type { ApplicationStatus, VendorProfile } from '../../shared/vendors';

import { ApiError } from './errors';
import type { DocumentStore } from './store';

interface ProfileDoc {
  fullName: string;
  username: string;
  phone?: string;
  verificationTier?: number;
  createdAt?: { toMillis(): number } | number | null;
}

interface HoldDoc {
  paused: boolean;
  reason: string;
  at: number;
  by: string;
}

interface LogDoc extends Omit<AdminLogEntry, 'id'> {
  adminUid: string;
  targetUid: string | null;
}

interface HumLike {
  senderName: string;
  senderUsername: string;
  amountMinor: number;
  currency: 'NGN' | 'USDC';
  note: string;
  status: string;
  settledAt: number | null;
  chosenClaimId: string | null;
  kind?: 'hum' | 'transfer';
}

export interface AdminDeps {
  store: DocumentStore;
  now: () => number;
  newId: () => string;
  /** Usernames of Faara's team (FAARA_ADMINS). */
  admins: readonly string[];
}

const holdPath = (uid: string) => `accountHolds/${uid}`;
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;

function millis(value: ProfileDoc['createdAt']): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return null;
}

/** "0803 123 4567", "8031234567" or "+2348031234567" → "+2348031234567". */
function e164(query: string): string | null {
  const digits = query.replace(/[^\d+]/g, '');
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

/**
 * The admin area: an overview of Faara, people and their accounts, payments, and a log of
 * every action the team takes. Only usernames listed in FAARA_ADMINS can use it.
 */
export class AdminService {
  constructor(private readonly deps: AdminDeps) {}

  async isAdmin(uid: string): Promise<boolean> {
    if (this.deps.admins.length === 0) return false;
    const me = await this.deps.store.transaction((tx) => tx.get<ProfileDoc>(`users/${uid}`));
    return Boolean(me && this.deps.admins.includes(me.username.toLowerCase()));
  }

  async requireAdmin(uid: string): Promise<ProfileDoc> {
    const me = await this.deps.store.transaction((tx) => tx.get<ProfileDoc>(`users/${uid}`));
    if (!me || !this.deps.admins.includes(me.username.toLowerCase())) {
      throw new ApiError('permission-denied', 'Only Faara’s team can do that.');
    }
    return me;
  }

  /** The team's user ids, for telling them about new tickets and applications. */
  async adminUids(): Promise<string[]> {
    const found = await this.deps.store.transaction(async (tx) =>
      Promise.all(this.deps.admins.map((name) => tx.get<{ uid: string }>(`usernames/${name}`))),
    );
    return found.flatMap((entry) => (entry ? [entry.uid] : []));
  }

  async isPaused(uid: string): Promise<boolean> {
    const hold = await this.deps.store.transaction((tx) => tx.get<HoldDoc>(holdPath(uid)));
    return hold?.paused === true;
  }

  /** Records something the team did. Every admin action goes through here. */
  async record(adminUid: string, action: string, targetUid: string | null, detail: string) {
    const { store, now, newId } = this.deps;
    await store.transaction(async (tx) => {
      const admin = await tx.get<ProfileDoc>(`users/${adminUid}`);
      const target = targetUid ? await tx.get<ProfileDoc>(`users/${targetUid}`) : undefined;
      tx.set(`adminLog/AL${newId()}`, {
        adminUid,
        admin: admin?.username ?? adminUid,
        action,
        targetUid,
        target: target?.username ?? null,
        detail: detail.slice(0, 300),
        at: now(),
      } satisfies LogDoc);
    });
  }

  async log(uid: string, limit = 50): Promise<AdminLogEntry[]> {
    await this.requireAdmin(uid);
    const rows = await this.deps.store.list<LogDoc>('adminLog', { orderBy: 'at', limit });
    return rows.map(({ id, data }) => ({
      id,
      admin: data.admin,
      action: data.action,
      target: data.target,
      detail: data.detail,
      at: data.at,
    }));
  }

  async overview(uid: string): Promise<AdminOverview> {
    await this.requireAdmin(uid);
    const { store, now } = this.deps;
    const local = now() + LAGOS_OFFSET_MS;
    const startOfDay = local - (local % DAY_MS) - LAGOS_OFFSET_MS;
    const [users, settledToday, openTickets, pendingVendors, vendors, paused, pockets, recentLog] =
      await Promise.all([
        store.count('users'),
        store.list<HumLike>('hums', { orderBy: 'settledAt', limit: 1000, after: startOfDay - 1 }),
        store.count('supportTickets', { field: 'status', equals: 'open' }),
        store.count('vendorApplications', { field: 'status', equals: 'pending' }),
        store.count('vendors'),
        store.count('accountHolds', { field: 'paused', equals: true }),
        store.count('pockets', { field: 'status', equals: 'open' }),
        this.log(uid, 8),
      ]);
    const naira = settledToday
      .map((row) => row.data)
      .filter((hum) => hum.status === 'settled' && hum.currency === 'NGN');
    return {
      users,
      paymentsToday: {
        count: naira.length,
        nairaKobo: naira.reduce((sum, hum) => sum + hum.amountMinor, 0),
      },
      openTickets,
      pendingVendors,
      vendors,
      pausedAccounts: paused,
      openPockets: pockets,
      recentLog,
    };
  }

  /** Find people by username, phone or id; with no query, the newest sign-ups. */
  async searchUsers(uid: string, query: string): Promise<AdminUserSummary[]> {
    await this.requireAdmin(uid);
    const { store } = this.deps;
    const summary = (id: string, profile: ProfileDoc): AdminUserSummary => ({
      uid: id,
      fullName: profile.fullName,
      username: profile.username,
      phone: profile.phone ?? '',
    });
    if (!query) {
      const rows = await store.list<ProfileDoc>('users', { orderBy: 'createdAt', limit: 20 });
      return rows.map(({ id, data }) => summary(id, data));
    }
    const clean = query.replace(/^@/, '').toLowerCase();
    const phone = e164(query);
    const ids = new Set<string>();
    const byUsername = await store.transaction((tx) =>
      tx.get<{ uid: string }>(`usernames/${clean}`),
    );
    if (byUsername) ids.add(byUsername.uid);
    if (phone) {
      const id = await store.findId('users', 'phone', phone);
      if (id) ids.add(id);
    }
    if (/^[A-Za-z0-9_-]{6,128}$/.test(query)) ids.add(query);
    const found = await store.transaction(async (tx) =>
      Promise.all(
        [...ids].map(async (id) => ({ id, profile: await tx.get<ProfileDoc>(`users/${id}`) })),
      ),
    );
    return found.flatMap(({ id, profile }) => (profile ? [summary(id, profile)] : []));
  }

  async userDetail(uid: string, target: string): Promise<AdminUserDetail> {
    await this.requireAdmin(uid);
    const { store } = this.deps;
    const read = await store.transaction(async (tx) => {
      const profile = await tx.get<ProfileDoc>(`users/${target}`);
      const account = await tx.get<{ balanceKobo?: number }>(`ledgerAccounts/${target}`);
      const wallet = await tx.get<{ address: string }>(`circleWallets/${target}`);
      const vendor = await tx.get<VendorProfile>(`vendors/${target}`);
      const application = await tx.get<{ status: ApplicationStatus }>(
        `vendorApplications/${target}`,
      );
      const hold = await tx.get<HoldDoc>(holdPath(target));
      const active = await tx.get<{ pocketId: string }>(`activePockets/${target}`);
      const pocket = active
        ? await tx.get<{
            limitKobo: number;
            remainingKobo: number;
            expiresAt: number;
            status: string;
          }>(`pockets/${active.pocketId}`)
        : undefined;
      return { profile, account, wallet, vendor, application, hold, pocket };
    });
    if (!read.profile) throw new ApiError('not-found', 'That person isn’t on Faara.');
    const [activity, tickets] = await Promise.all([
      store.list<ActivityEntry>(`users/${target}/activity`, { orderBy: 'createdAt', limit: 30 }),
      store.list<SupportTicket>(`users/${target}/tickets`, { orderBy: 'updatedAt', limit: 20 }),
    ]);
    const { profile, pocket, hold } = read;
    return {
      uid: target,
      fullName: profile.fullName,
      username: profile.username,
      phone: profile.phone ?? '',
      createdAt: millis(profile.createdAt),
      verificationTier: profile.verificationTier ?? 1,
      nairaKobo: read.account?.balanceKobo ?? MOCK_STARTING_BALANCE_KOBO,
      usdcAddress: read.wallet?.address ?? null,
      vendor: read.vendor ?? null,
      vendorApplication: read.application?.status ?? null,
      paused: hold?.paused ? { reason: hold.reason, at: hold.at, by: hold.by } : null,
      pocket:
        pocket && pocket.status === 'open'
          ? {
              limitKobo: pocket.limitKobo,
              remainingKobo: pocket.remainingKobo,
              expiresAt: pocket.expiresAt,
            }
          : null,
      activity: activity.map((row) => row.data),
      tickets: tickets.map(({ id, data }) => ({ ...data, id })),
    };
  }

  /** Pauses or unpauses an account. A paused account can't move money but can still get help. */
  async setPaused(uid: string, target: string, paused: boolean, reason: string): Promise<void> {
    const admin = await this.requireAdmin(uid);
    const { store, now } = this.deps;
    await store.transaction(async (tx) => {
      const profile = await tx.get<ProfileDoc>(`users/${target}`);
      if (!profile) throw new ApiError('not-found', 'That person isn’t on Faara.');
      tx.set(holdPath(target), {
        paused,
        reason: paused ? reason : '',
        at: now(),
        by: admin.username,
      } satisfies HoldDoc);
    });
    await this.record(uid, paused ? 'Paused account' : 'Unpaused account', target, reason);
  }

  /** The latest settled payments across Faara. */
  async payments(uid: string): Promise<AdminPayment[]> {
    await this.requireAdmin(uid);
    const { store } = this.deps;
    const rows = await store.list<HumLike>('hums', { orderBy: 'settledAt', limit: 50 });
    const settled = rows.filter((row) => row.data.status === 'settled' && row.data.settledAt);
    const recipients = await store.transaction(async (tx) =>
      Promise.all(
        settled.map((row) =>
          row.data.chosenClaimId
            ? tx.get<{ fullName: string; username: string; channel?: string }>(
                `hums/${row.id}/claims/${row.data.chosenClaimId}`,
              )
            : Promise.resolve(undefined),
        ),
      ),
    );
    return settled.map(({ id, data }, i) => {
      const to = recipients[i];
      return {
        paymentId: id,
        kind: data.kind ?? 'hum',
        channel: to?.channel ?? 'sound',
        amountMinor: data.amountMinor,
        currency: data.currency,
        note: data.note,
        settledAt: data.settledAt ?? 0,
        from: { fullName: data.senderName, username: data.senderUsername },
        to: to ? { fullName: to.fullName, username: to.username } : null,
      };
    });
  }
}
