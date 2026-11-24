import { parseLookupUser } from '../../../shared/hum';
import { parseNewTicket, parseTicketRef, parseTicketReply } from '../../../shared/support';
import {
  parseTillLookup,
  parseVendorApplication,
  parseVendorReview,
} from '../../../shared/vendors';
import { authedRoute, humRoute } from '../http';

/** POST /api/users/lookup: find someone by username before sending to them. */
export const lookup = humRoute(
  parseLookupUser,
  (service, uid, request) => service.lookupUser(uid, request),
  { movesMoney: false },
);

/** POST /api/users/vendor: the caller's vendor application and status. */
export const vendor = authedRoute(
  () => ({}),
  ({ uid, services }) => services.vendors.status(uid),
);

/** POST /api/users/till: the caller's till code (approved vendors only). */
export const till = authedRoute(
  () => ({}),
  ({ uid, services }) => services.vendors.till(uid),
);

/** POST /api/users/shop: the verified shop behind a till code a phone picked up. */
export const shop = authedRoute(parseTillLookup, ({ services }, request) =>
  services.vendors.shop(request.code),
);

/** POST /api/users/apply: apply to become a vendor. */
export const apply = authedRoute(parseVendorApplication, ({ uid, services }, request) =>
  services.vendors.apply(uid, request),
);

/** POST /api/users/applications: vendor applications waiting for review (reviewers only). */
export const applications = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ applications: await services.vendors.pending(uid) }),
);

/** POST /api/users/review: approve or reject a vendor application (reviewers only). */
export const review = authedRoute(parseVendorReview, async ({ uid, services }, request) => {
  await services.vendors.review(uid, request);
  return { ok: true };
});

/** POST /api/users/ticket: open a support ticket. */
export const ticket = authedRoute(parseNewTicket, ({ uid, services }, request) =>
  services.support.create(uid, request),
);

/** POST /api/users/tickets: the caller's support tickets. */
export const tickets = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ tickets: await services.support.mine(uid) }),
);

/** POST /api/users/thread: one ticket and its messages (its owner, or Faara's team). */
export const thread = authedRoute(parseTicketRef, ({ uid, services }, request) =>
  services.support.thread(uid, request.ticketId),
);

/** POST /api/users/reply: reply in a ticket's thread (its owner, or Faara's team). */
export const reply = authedRoute(parseTicketReply, ({ uid, services }, request) =>
  services.support.reply(uid, request.ticketId, request.text),
);
