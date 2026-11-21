import {
  parseCancelHum,
  parseChooseRecipient,
  parseClaimHum,
  parseCreateHum,
  parseSettleHum,
} from '../../../shared/hum';
import { humRoute } from '../http';

/** POST /api/hums/create: issue a hum code for a payment. */
export const create = humRoute(parseCreateHum, (service, uid, request) =>
  service.createHum(uid, request),
);

/**
 * POST /api/hums/claim: a receiver claims a hum code it decoded. The safety check for the
 * sender's list runs right after; if it fails the claim still stands, just unassessed.
 */
export const claim = humRoute(parseClaimHum, async (service, uid, request) => {
  const response = await service.claimHum(uid, request);
  await service.assessClaim(response.paymentId, response.claimId).catch(() => null);
  return response;
});

/** POST /api/hums/choose: the sender picks who gets paid; returns the matching shapes. */
export const choose = humRoute(parseChooseRecipient, (service, uid, request) =>
  service.chooseRecipient(uid, request),
);

/** POST /api/hums/cancel: the sender abandons an open hum. */
export const cancel = humRoute(
  parseCancelHum,
  (service, uid, request) => service.cancelHum(uid, request),
  { movesMoney: false },
);

/** POST /api/hums/settle: complete a chosen hum (verify the USDC transfer, or move naira). */
export const settle = humRoute(parseSettleHum, (service, uid, request) =>
  service.settleHum(uid, request),
);
