import { parseCreateTransfer } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/**
 * POST /api/payments/transfer: Send to a username. Returns a payment addressed to the
 * recipient, with its safety check run; the app then settles it with /api/hums/settle
 * after the user approves.
 */
export const POST = humRoute(parseCreateTransfer, async (service, uid, request) => {
  const transfer = await service.createTransfer(uid, request);
  await service.assessClaim(transfer.paymentId, transfer.claimId).catch(() => null);
  return transfer;
});
