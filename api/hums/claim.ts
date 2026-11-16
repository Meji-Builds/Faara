import { parseClaimHum } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/**
 * POST /api/hums/claim: a receiver claims a hum code it decoded. The safety check for the
 * sender's list runs right after; if it fails the claim still stands, just unassessed.
 */
export const POST = humRoute(parseClaimHum, async (service, uid, request) => {
  const response = await service.claimHum(uid, request);
  await service.assessClaim(response.paymentId, response.claimId).catch(() => null);
  return response;
});
