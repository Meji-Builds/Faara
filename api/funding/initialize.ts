import { parseInitializeFunding } from '../../shared/hum';
import { ApiError } from '../_lib/errors';
import { authedRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

const NATIVE_RETURN_URL = 'faara://add-money';

/** Origins the web checkout may return to. */
function webReturnUrl(http: Request): string {
  const origin = http.headers.get('origin') ?? '';
  const allowed =
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) throw new ApiError('invalid-argument', 'This site can’t start a top-up.');
  return `${origin}/add-money`;
}

/** POST /api/funding/initialize: start a naira top-up and get the checkout link. */
export const POST = authedRoute(parseInitializeFunding, ({ uid, services, http }, request) =>
  services.funding.initialize(
    uid,
    request.amount,
    request.platform === 'native' ? NATIVE_RETURN_URL : webReturnUrl(http),
  ),
);
