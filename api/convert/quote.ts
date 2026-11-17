import { parseQuoteRequest } from '../../shared/convert';
import { authedRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/convert/quote: price a conversion between naira, dollars and USDC. */
export const POST = authedRoute(parseQuoteRequest, ({ uid, services }, request) =>
  services.convert.quote(uid, request),
);
