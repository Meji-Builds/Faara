import { dispatch } from '../_lib/dispatch';
import { setup, status, treasury, withdraw, withdrawal } from '../_lib/routes/wallet';

export { OPTIONS } from '../_lib/http';

/** POST /api/wallet/{status,withdraw,withdrawal}; GET /api/wallet/{setup,treasury}. */
export const POST = dispatch({ status, withdraw, withdrawal });
export const GET = dispatch({ setup, treasury });
