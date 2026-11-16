import { parseSettleHum } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/settle: complete a chosen hum (verify the USDC transfer, or move naira). */
export const POST = humRoute(parseSettleHum, (service, uid, request) =>
  service.settleHum(uid, request),
);
