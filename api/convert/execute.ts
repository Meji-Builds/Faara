import { parseExecuteRequest } from '../../shared/convert';
import { authedRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/convert/execute: run a quote and return the new balances. */
export const POST = authedRoute(parseExecuteRequest, ({ uid, services }, request) =>
  services.convert.execute(uid, request.quoteId),
);
