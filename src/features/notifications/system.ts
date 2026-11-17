import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'payments';

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Asks for notification permission. Resolves true when granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Payments',
      importance: AndroidImportance.HIGH,
    });
  }
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await requestPermissionsAsync()).granted;
}

/**
 * Expo push token for this device, or null when remote push isn't available (emulator,
 * or a build without Firebase Cloud Messaging configured). Local alerts still work.
 */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    if (!projectId) return null;
    return (await getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Shows a system notification right away. */
export async function showSystemNotification(
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  await scheduleNotificationAsync({
    content: { title, body, data },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

/** Calls `onOpen` with the payment id when a payment notification is tapped. */
export function onNotificationOpened(onOpen: (paymentId: string) => void): () => void {
  const subscription = addNotificationResponseReceivedListener((response) => {
    const paymentId = response.notification.request.content.data?.paymentId;
    if (typeof paymentId === 'string') onOpen(paymentId);
  });
  return () => subscription.remove();
}
