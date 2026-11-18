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

/**
 * GET /api/wallet/treasury?token=...: the address and balance of Faara's own USDC float, so it
 * can be topped up from the test faucet. Uses the same CIRCLE_SETUP_TOKEN as setup.
 */
export async function treasury(request: Request): Promise<Response> {
  try {
    const circle = getServices().circle;
    const token = new URL(request.url).searchParams.get('token');
    if (!circle.allowsSetup(token)) {
      return json(403, { error: { code: 'permission-denied', message: 'Not allowed from here.' } });
    }
    return json(200, await circle.treasury());
  } catch (error) {
    return errorResponse(error);
  }
}
