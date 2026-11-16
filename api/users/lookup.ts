import { parseLookupUser } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/users/lookup: find someone by username before sending to them. */
export const POST = humRoute(parseLookupUser, (service, uid, request) =>
  service.lookupUser(uid, request),
);
