import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/offline';

export { OPTIONS } from '../_lib/http';

/** POST /api/offline/<action>: one function serving the offline pocket routes. */
export const POST = dispatch(routes);
