import * as WebBrowser from 'expo-web-browser';

/** Opens the payment page in an in-app browser and resolves when it closes or returns. */
export async function openCheckout(url: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, 'faara://add-money');
}

export const CHECKOUT_PLATFORM = 'native' as const;
