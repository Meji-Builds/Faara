/**
 * Dollar (USDC) features are paused while naira payments are being tested.
 * Flip this on to bring back the dollar wallet, currency switches and Invoices.
 */
export const DOLLARS_ENABLED = false;

/** Converting between naira, dollars and USDC inside Faara (test rates until a partner is live). */
export const CONVERT_ENABLED = true;

/** Paying and being paid with no network, from a pocket of naira set aside on the phone. */
export const OFFLINE_ENABLED = true;

/** Ask Faara (voice and text), the scam guard and the money agent. */
export const ASSISTANT_ENABLED = true;
