import { parseCreateHum } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/create: issue a hum code for a payment. */
export const POST = humRoute(parseCreateHum, (service, uid, request) =>
  service.createHum(uid, request),
);
