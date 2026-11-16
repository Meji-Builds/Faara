import { parseCancelHum } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/cancel: the sender abandons an open hum. */
export const POST = humRoute(parseCancelHum, (service, uid, request) =>
  service.cancelHum(uid, request),
);
