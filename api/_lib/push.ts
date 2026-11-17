import type { DocumentStore } from './store';

interface PushDoc {
  tokens?: string[];
  moneyReceived?: boolean;
}

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends "money received" push notifications through Expo's push service, to the tokens the
 * person's devices registered in `users/{uid}/private/push`, unless they turned them off.
 */
export function createNotifier(store: DocumentStore) {
  return async function notify(uid: string, message: PushMessage): Promise<void> {
    const settings = await store.transaction((tx) => tx.get<PushDoc>(`users/${uid}/private/push`));
    const tokens = (settings?.tokens ?? []).filter((token) =>
      /^Expo(nent)?PushToken\[.+\]$/.test(token),
    );
    if (tokens.length === 0 || settings?.moneyReceived === false) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          channelId: 'payments',
        })),
      ),
    });
  };
}
