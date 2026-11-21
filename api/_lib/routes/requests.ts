import { parseCreateRequest, parseRequestId } from '../../../shared/requests';
import { authedRoute } from '../http';

/** POST /api/requests/create: ask a person, or anyone with the link, for money. */
export const create = authedRoute(parseCreateRequest, ({ uid, services }, request) =>
  services.requests.create(uid, request),
);

/** POST /api/requests/get: one request, as the requester or a possible payer sees it. */
export const get = authedRoute(parseRequestId, ({ uid, services }, request) =>
  services.requests.get(uid, request.id),
);

/** POST /api/requests/list: requests the caller sent and ones they're asked to pay. */
export const list = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({ requests: await services.requests.list(uid) }),
);

/** POST /api/requests/cancel: withdraw an unpaid request. */
export const cancel = authedRoute(parseRequestId, ({ uid, services }, request) =>
  services.requests.cancel(uid, request.id),
);
