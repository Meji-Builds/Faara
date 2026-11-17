/** Web: leaves for the payment page; it returns to /add-money?reference=… afterwards. */
export async function openCheckout(url: string): Promise<void> {
  window.location.assign(url);
  await new Promise(() => undefined); // navigation takes over
}

export const CHECKOUT_PLATFORM = 'web' as const;
