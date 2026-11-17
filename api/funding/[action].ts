import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/funding';

export { OPTIONS } from '../_lib/http';

/** POST /api/funding/<action>: one function serving this family of routes. */
export const POST = dispatch(routes);
