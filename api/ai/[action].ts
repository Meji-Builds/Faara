import { dispatch } from '../_lib/dispatch';
import * as routes from '../_lib/routes/ai';

export { OPTIONS } from '../_lib/http';

const { cron, exportExamples, ...posts } = routes;

/** POST /api/ai/<action> for the assistant and money agent; GET /api/ai/{cron,export}. */
export const POST = dispatch(posts);
export const GET = dispatch({ cron, export: exportExamples });
