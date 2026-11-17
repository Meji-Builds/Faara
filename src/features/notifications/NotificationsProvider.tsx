import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ActivityEntry } from '@shared/hum';

import { useActivity, watchActivity } from '@/features/account';
import { useAuth } from '@/features/auth';
import { usePreferences } from '@/features/preferences';
import { formatMoney } from '@/lib/money';

import { savePushSettings } from './pushSettings';
import {
  getPushToken,
  onNotificationOpened,
  requestNotificationPermission,
  showSystemNotification,
} from './system';

export interface IncomingAlert {
  paymentId: string;
  title: string;
  body: string;
}

interface NotificationsContextValue {
  /** The alert currently shown as an in-app banner. */
  alert: IncomingAlert | null;
  dismissAlert: () => void;
  /** Money received since the notifications screen was last opened. */
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function describeIncoming(entry: ActivityEntry): IncomingAlert {
  const amount = formatMoney(entry.amountMinor / 100, entry.currency, {
    decimals: entry.currency === 'USDC' ? 2 : undefined,
  });
  const from =
    entry.kind === 'deposit' ? 'added to your balance' : `from ${entry.counterpartyName}`;
  return {
    paymentId: entry.paymentId,
    title: `${amount} ${from}`,
    body:
      entry.note ||
      (entry.kind === 'deposit' ? 'Your top-up has arrived.' : 'Tap to see the receipt.'),
  };
}

/**
 * Money-received alerts. While the app is open, new incoming payments show an in-app
 * banner and (unless the server already pushes to this device) a system notification.
 * Also keeps the server's copy of the push token and notification choices up to date.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, status } = useAuth();
  const uid = status === 'ready' ? user?.uid : undefined;
  const { preferences, loaded, setPreference } = usePreferences();
  const activity = useActivity(20);
  const [alert, setAlert] = useState<IncomingAlert | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const { notifyMoneyReceived, notifyOffers, notificationsSeenAt } = preferences;

  // Register for notifications when the person wants them.
  useEffect(() => {
    if (!uid || !loaded || !notifyMoneyReceived) return;
    let cancelled = false;
    (async () => {
      if (!(await requestNotificationPermission().catch(() => false))) return;
      const token = await getPushToken();
      if (!cancelled) setPushToken(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, loaded, notifyMoneyReceived]);

  // Tell the server where and whether to push.
  useEffect(() => {
    if (!uid || !loaded) return;
    savePushSettings(uid, {
      tokens: pushToken ? [pushToken] : [],
      moneyReceived: notifyMoneyReceived,
      offers: notifyOffers,
    }).catch(() => undefined);
  }, [uid, loaded, pushToken, notifyMoneyReceived, notifyOffers]);

  // Alert on incoming payments that arrive while the app is open.
  const settings = useRef({ notifyMoneyReceived, pushToken });
  useEffect(() => {
    settings.current = { notifyMoneyReceived, pushToken };
  }, [notifyMoneyReceived, pushToken]);

  useEffect(() => {
    if (!uid) return;
    let known: Set<string> | null = null;
    return watchActivity(uid, 10, (entries) => {
      const incoming = entries.filter((entry) => entry.direction === 'in');
      if (known === null) {
        known = new Set(incoming.map((entry) => entry.paymentId)); // history, not news
        return;
      }
      for (const entry of incoming) {
        if (known.has(entry.paymentId)) continue;
        known.add(entry.paymentId);
        if (!settings.current.notifyMoneyReceived) continue;
        const next = describeIncoming(entry);
        setAlert(next);
        // With a push token the server sends the system notification; otherwise do it here.
        if (!settings.current.pushToken) {
          showSystemNotification(next.title, next.body, { paymentId: entry.paymentId }).catch(
            () => undefined,
          );
        }
      }
    });
  }, [uid]);

  // Auto-hide the banner.
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [alert]);

  // Tapping a system notification opens the receipt.
  useEffect(
    () =>
      onNotificationOpened((paymentId) =>
        router.push({ pathname: '/receipt/[paymentId]', params: { paymentId } }),
      ),
    [router],
  );

  const unreadCount = useMemo(
    () =>
      activity?.filter((entry) => entry.direction === 'in' && entry.createdAt > notificationsSeenAt)
        .length ?? 0,
    [activity, notificationsSeenAt],
  );

  const dismissAlert = useCallback(() => setAlert(null), []);
  const markAllRead = useCallback(
    () => setPreference('notificationsSeenAt', Date.now()),
    [setPreference],
  );

  const value = useMemo(
    () => ({ alert, dismissAlert, unreadCount, markAllRead }),
    [alert, dismissAlert, unreadCount, markAllRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside <NotificationsProvider>.');
  return context;
}
