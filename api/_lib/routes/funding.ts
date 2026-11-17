import { parseInitializeFunding, parseVerifyFunding } from '../../../shared/hum';
import { ApiError } from '../errors';
import { authedRoute } from '../http';

const NATIVE_RETURN_URL = 'faara://add-money';

/** Origins the web checkout may return to. */
function webReturnUrl(http: Request): string {
  const origin = http.headers.get('origin') ?? '';
  const allowed =
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    origin === 'https://faara.mejibuilds.com' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) throw new ApiError('invalid-argument', 'This site can’t start a top-up.');
  return `${origin}/add-money`;
}

/** POST /api/funding/initialize: start a naira top-up and get the checkout link. */
export const initialize = authedRoute(parseInitializeFunding, ({ uid, services, http }, request) =>
  services.funding.initialize(
    uid,
    request.amount,
    request.platform === 'native' ? NATIVE_RETURN_URL : webReturnUrl(http),
  ),
);

/** POST /api/funding/verify: check a top-up after returning from checkout, and credit it. */
export const verify = authedRoute(parseVerifyFunding, ({ uid, services }, request) =>
  services.funding.confirm(request.reference, uid),
);
