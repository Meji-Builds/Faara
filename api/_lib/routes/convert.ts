import { parseExecuteRequest, parseQuoteRequest } from '../../../shared/convert';
import { authedRoute } from '../http';

/** POST /api/convert/quote: price a conversion between naira, dollars and USDC. */
export const quote = authedRoute(parseQuoteRequest, ({ uid, services }, request) =>
  services.convert.quote(uid, request),
);

/** POST /api/convert/execute: run a quote and return the new balances. */
export const execute = authedRoute(parseExecuteRequest, ({ uid, services }, request) =>
  services.convert.execute(uid, request.quoteId),
);
