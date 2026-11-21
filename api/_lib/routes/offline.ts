import { parseOpenPocket, parseSettleNotes } from '../../../shared/offline';
import { authedRoute } from '../http';

/** POST /api/offline/open: lock naira into an offline pocket and get its certificate. */
export const open = authedRoute(
  parseOpenPocket,
  ({ uid, services }, request) => services.offline.openPocket(uid, request),
  { movesMoney: true },
);

/** POST /api/offline/settle: settle payments received offline. */
export const settle = authedRoute(
  parseSettleNotes,
  async ({ uid, services }, request) => ({
    results: await services.offline.settleNotes(uid, request.notes),
  }),
  { movesMoney: true },
);

/** POST /api/offline/status: the caller's open pocket, if any, and Faara's certificate key. */
export const status = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({
    pocket: await services.offline.status(uid),
    serverPublicKey: await services.offline.publicKey(),
  }),
);

/** POST /api/offline/release: return an expired pocket's unspent money to the balance. */
export const release = authedRoute(
  () => ({}),
  ({ uid, services }) => services.offline.release(uid),
);
