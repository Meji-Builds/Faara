import { dispatch } from '../_lib/dispatch';
import { setup, status, treasury } from '../_lib/routes/wallet';

export { OPTIONS } from '../_lib/http';

/** POST /api/wallet/status and GET /api/wallet/setup. */
export const POST = dispatch({ status });
export const GET = dispatch({ setup, treasury });
