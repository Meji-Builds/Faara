import {
  parseOpenPocket,
  parseReclaim,
  parseReserve,
  parseSettleNotes,
  parseTopUpPocket,
} from '../../../shared/offline';
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
    reserveKobo: await services.offline.reserve(uid),
  }),
);

/** POST /api/offline/release: return an expired pocket's unspent money to the balance. */
export const release = authedRoute(
  () => ({}),
  ({ uid, services }) => services.offline.release(uid),
);

/** POST /api/offline/topup: add to the open pocket on this phone, or renew it. */
export const topup = authedRoute(
  parseTopUpPocket,
  ({ uid, services }, request) => services.offline.topUpPocket(uid, request),
  { movesMoney: true },
);

/** POST /api/offline/identity: a Faara-signed card with the caller's name, for receiving offline. */
export const identity = authedRoute(
  () => ({}),
  ({ uid, services }) => services.offline.identity(uid),
);

/** POST /api/offline/reclaim: restore the open pocket on the phone that holds its key. */
export const reclaim = authedRoute(parseReclaim, ({ uid, services }, request) =>
  services.offline.reclaim(uid, request.devicePublicKey),
);

/** POST /api/offline/reserve: save how much to keep ready offline. */
export const reserve = authedRoute(parseReserve, async ({ uid, services }, request) => {
  await services.offline.setReserve(uid, request.reserveKobo);
  return { ok: true };
});

/** POST /api/offline/move: move the open pocket to this phone (its old key was lost). */
export const move = authedRoute(parseReclaim, ({ uid, services }, request) =>
  services.offline.move(uid, request.devicePublicKey),
);
