import { parseVerifyFunding } from '../../shared/hum';
import { authedRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/funding/verify: check a top-up after returning from checkout, and credit it. */
export const POST = authedRoute(parseVerifyFunding, ({ uid, services }, request) =>
  services.funding.confirm(request.reference, uid),
);
