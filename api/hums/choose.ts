import { parseChooseRecipient } from '../../shared/hum';
import { humRoute } from '../_lib/http';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/choose: the sender picks who gets paid; returns the matching shapes. */
export const POST = humRoute(parseChooseRecipient, (service, uid, request) =>
  service.chooseRecipient(uid, request),
);
