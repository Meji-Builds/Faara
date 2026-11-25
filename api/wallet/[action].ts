import { dispatch } from '../_lib/dispatch';
import {
  feepayer,
  leftover,
  setup,
  sponsor,
  status,
  treasury,
  withdraw,
  withdrawal,
} from '../_lib/routes/wallet';

export { OPTIONS } from '../_lib/http';

/**
 * POST /api/wallet/{status,withdraw,withdrawal,feepayer,sponsor,leftover};
 * GET /api/wallet/{setup,treasury}.
 */
export const POST = dispatch({ status, withdraw, withdrawal, feepayer, sponsor, leftover });
export const GET = dispatch({ setup, treasury });
