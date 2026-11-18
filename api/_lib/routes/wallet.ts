import { authedRoute, errorResponse, getServices, json } from '../http';

/** POST /api/wallet/status: the caller's USDC wallet on the test network (made on first use). */
export const status = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({
    configured: services.circle.configured,
    wallet: services.circle.configured ? await services.circle.info(uid) : null,
  }),
);

/**
 * GET /api/wallet/setup?token=...: one-time setup of Circle's entity secret. Only works while
 * CIRCLE_SETUP_TOKEN is set; remove that variable afterwards.
 */
export async function setup(request: Request): Promise<Response> {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const result = await getServices().circle.setup(token);
    return json(200, {
      done: true,
      message: 'Save the recovery file below somewhere safe, then remove CIRCLE_SETUP_TOKEN.',
      recoveryFile: result.recoveryFile,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
