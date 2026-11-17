import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/hums';

export { OPTIONS } from '../_lib/http';

/** POST /api/hums/<action>: one function serving this family of routes. */
export const POST = dispatch(routes);
