import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/admin';

export { OPTIONS } from '../_lib/http';

const { ticketStatus, ...rest } = routes;

/** POST /api/admin/<action>: the admin area, for Faara's team only. */
export const POST = dispatch({ ...rest, 'ticket-status': ticketStatus });
