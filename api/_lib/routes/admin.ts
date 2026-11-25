import { parsePause, parseUserRef, parseUserSearch } from '../../../shared/admin';
import { parseDecision } from '../../../shared/disputes';
import { parseTicketStatus } from '../../../shared/support';
import { authedRoute } from '../http';

/** POST /api/admin/me: whether the caller is on Faara's team. */
export const me = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ isAdmin: await services.admin.isAdmin(uid) }),
);

/** POST /api/admin/overview: the dashboard's numbers and the latest admin actions. */
export const overview = authedRoute(
  () => ({}),
  ({ uid, services }) => services.admin.overview(uid),
);

/** POST /api/admin/users: find people by username, phone or id (newest if no query). */
export const users = authedRoute(parseUserSearch, async ({ uid, services }, request) => ({
  users: await services.admin.searchUsers(uid, request.query),
}));

/** POST /api/admin/user: everything about one person's account. */
export const user = authedRoute(parseUserRef, ({ uid, services }, request) =>
  services.admin.userDetail(uid, request.uid),
);

/** POST /api/admin/pause: pause or unpause an account's payments. */
export const pause = authedRoute(parsePause, async ({ uid, services }, request) => {
  await services.admin.setPaused(uid, request.uid, request.paused, request.reason);
  return { ok: true };
});

/** POST /api/admin/payments: the latest settled payments. */
export const payments = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ payments: await services.admin.payments(uid) }),
);

/** POST /api/admin/log: every action Faara's team has taken, newest first. */
export const log = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ log: await services.admin.log(uid) }),
);

/** POST /api/admin/feewallet: the wallet Faara pays network fees from, and its SOL. */
export const feewallet = authedRoute(
  () => ({}),
  async ({ uid, services }) => {
    await services.admin.requireAdmin(uid);
    return services.feeSponsor.status();
  },
);

/** POST /api/admin/disputes: payment disputes, newest first. */
export const disputes = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ disputes: await services.disputes.list(uid) }),
);

/** POST /api/admin/decide: refund or reject a dispute (large refunds need two admins). */
export const decide = authedRoute(
  parseDecision,
  ({ uid, services }, request) => services.disputes.decide(uid, request),
  { movesMoney: true },
);

/** POST /api/admin/tickets: the support queue, open tickets first. */
export const tickets = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ tickets: await services.support.queue(uid) }),
);

/** POST /api/admin/ticket-status: mark a ticket open, answered or closed. */
export const ticketStatus = authedRoute(parseTicketStatus, ({ uid, services }, request) =>
  services.support.setStatus(uid, request.ticketId, request.status),
);
