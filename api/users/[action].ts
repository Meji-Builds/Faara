import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/users';

export { OPTIONS } from '../_lib/http';

/** POST /api/users/<action>: finding people, and vendor applications. */
export const POST = dispatch(routes);
