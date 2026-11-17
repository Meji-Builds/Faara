import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/convert';

export { OPTIONS } from '../_lib/http';

/** POST /api/convert/<action>: one function serving this family of routes. */
export const POST = dispatch(routes);
