import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/requests';

export { OPTIONS } from '../_lib/http';

/** POST /api/requests/<action>: payment requests (invoices). */
export const POST = dispatch(routes);
