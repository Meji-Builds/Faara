import { parseClaimHum } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/claim: a receiver claims a hum code it decoded. */
export const POST = humRoute(parseClaimHum, (service, uid, request) =>
  service.claimHum(uid, request),
);
