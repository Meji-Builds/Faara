import { parseExecuteRequest, parseQuoteRequest } from '../../../shared/convert';
import { authedRoute } from '../http';

/** POST /api/convert/quote: price a conversion between naira and USDC. */
export const quote = authedRoute(parseQuoteRequest, ({ uid, services }, request) =>
  services.convert.quote(uid, request),
);

/** POST /api/convert/execute: start a quote. Returns `pending` until the transfer confirms. */
export const execute = authedRoute(
  parseExecuteRequest,
  ({ uid, services }, request) => services.convert.execute(uid, request.quoteId),
  { movesMoney: true },
);

/** POST /api/convert/status: check a started conversion and finish it if it has settled. */
export const status = authedRoute(parseExecuteRequest, ({ uid, services }, request) =>
  services.convert.settle(uid, request.quoteId),
);
