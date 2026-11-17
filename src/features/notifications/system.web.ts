/** Web: uses the browser Notification API when the tab is in the background. */

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Web push needs a service worker and isn't set up; in-app and tab alerts are used instead. */
export async function getPushToken(): Promise<string | null> {
  return null;
}

export async function showSystemNotification(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return; // the in-app banner covers it
  new Notification(title, { body });
}

export function onNotificationOpened(): () => void {
  return () => undefined;
}
