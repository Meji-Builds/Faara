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

/** What a tapped notification points at: a receipt, a request, a ticket, a dispute or a screen. */
export type OpenedNotification =
  | { paymentId: string }
  | { disputeId: string }
  | { requestId: string }
  | { ticketId: string }
  | { screen: 'vendor' | 'agent' };

export function onNotificationOpened(onOpen: (target: OpenedNotification) => void): () => void {
  const subscription = addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (typeof data?.ticketId === 'string') onOpen({ ticketId: data.ticketId });
    else if (typeof data?.disputeId === 'string') onOpen({ disputeId: data.disputeId });
    else if (data?.screen === 'vendor' || data?.screen === 'agent') onOpen({ screen: data.screen });
    else if (typeof data?.requestId === 'string') onOpen({ requestId: data.requestId });
    else if (typeof data?.paymentId === 'string') onOpen({ paymentId: data.paymentId });
  });
  return () => subscription.remove();
}
