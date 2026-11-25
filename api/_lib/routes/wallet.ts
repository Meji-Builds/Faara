import { parseRequestId, parseSponsorRequest, parseWithdrawRequest } from '../../../shared/solana';
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

/** POST /api/wallet/leftover: USDC left in the wallet Faara used to hold, to move it over. */
export const leftover = authedRoute(
  () => ({}),
  async ({ uid, services }) => ({
    cents: services.circle.configured ? await services.circle.leftoverCents(uid) : 0,
  }),
);

/** POST /api/wallet/withdraw: send the caller's USDC to a Solana address they choose. */
export const withdraw = authedRoute(
  parseWithdrawRequest,
  async ({ uid, services }, request) => {
    // Moving to the person's own wallet: make sure it can hold USDC first.
    await services.feeSponsor.prepareOwnWallet(uid, request.address);
    return services.circle.withdraw(uid, request);
  },
  { movesMoney: true },
);

/** POST /api/wallet/withdrawal: how one of the caller's withdrawals is going. */
export const withdrawal = authedRoute(
  (body) => ({ requestId: parseRequestId((body as { requestId?: unknown } | null)?.requestId) }),
  ({ uid, services }, request) => services.circle.withdrawalState(uid, request.requestId),
);

/** POST /api/wallet/feepayer: the address phones set as fee payer, so Faara pays the fee. */
export const feepayer = authedRoute(
  () => ({}),
  async ({ services }) => ({ address: await services.feeSponsor.address() }),
);

/** POST /api/wallet/sponsor: co-sign and send a USDC payment, with Faara paying the fee. */
export const sponsor = authedRoute(
  parseSponsorRequest,
  async ({ uid, services }, request) => ({
    signature: await services.feeSponsor.sponsor(uid, request.transaction),
  }),
  { movesMoney: true },
);
