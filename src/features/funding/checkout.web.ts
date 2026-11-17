/** Web: leaves for the payment page; it returns to /add-money?reference=… afterwards. */
export async function openCheckout(url: string): Promise<void> {
  if (process.env.EXPO_PUBLIC_DEMO === '1') {
    await new Promise((r) => setTimeout(r, 1800));
    return;
  }
  window.location.assign(url);
  await new Promise(() => undefined); // navigation takes over
}

export const CHECKOUT_PLATFORM = 'web' as const;
