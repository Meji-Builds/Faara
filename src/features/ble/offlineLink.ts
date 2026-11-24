import { FaaraBle } from '@modules/faara-ble';
import { Buffer } from 'buffer';

/**
 * The direct Bluetooth link two phones use for an offline hum. The receiver serves an offer
 * (who they are and a fresh nonce); the payer connects, reads it, and sends back a signed
 * payment; the receiver answers once it has checked the payment. Everything sent is signed
 * and checked by the app, so the link itself only has to carry bytes.
 */

/** The receiver's answer to a payment. */
export type HumAnswer = { ok: true } | { ok: false; reason: string };

/** Sightings weaker than this are too far away to be the phone in front of you. */
export const OFFLINE_MIN_RSSI = -78;
/** After the first close sighting, keep listening this long so the closest phone wins. */
const SETTLE_MS = 1200;

const toBase64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const fromBase64 = (base64: string) => Buffer.from(base64, 'base64').toString('utf8');

function requireNative() {
  if (!FaaraBle) throw new Error('Offline payments need the Faara app on Android.');
  return FaaraBle;
}

export function encodeAnswer(answer: HumAnswer): string {
  return JSON.stringify(answer);
}

/** Reads a receiver's answer; anything unreadable counts as a failure. */
export function decodeAnswer(text: string): HumAnswer {
  try {
    const value = JSON.parse(text) as Partial<{ ok: boolean; reason: string }>;
    if (value.ok === true) return { ok: true };
    return {
      ok: false,
      reason:
        typeof value.reason === 'string' ? value.reason.slice(0, 200) : 'It didn’t go through.',
    };
  } catch {
    return { ok: false, reason: 'The other phone’s answer couldn’t be read.' };
  }
}

/** The strongest sighting at or above the minimum signal, or null. */
export function pickNearest(sightings: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let bestRssi = OFFLINE_MIN_RSSI;
  for (const [deviceId, rssi] of sightings) {
    if (rssi >= bestRssi) {
      best = deviceId;
      bestRssi = rssi;
    }
  }
  return best;
}

/**
 * Looks for the closest phone ready to receive. Calls `onFound` once with its id. Returns a
 * function that stops looking.
 */
export async function lookForReceiver(onFound: (deviceId: string) => void): Promise<() => void> {
  const native = requireNative();
  // Keep each phone's strongest recent reading; signal strength jumps around.
  const sightings = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const stop = () => {
    done = true;
    if (timer) clearTimeout(timer);
    subscription.remove();
    void native.stopOfflineLooking().catch(() => undefined);
  };
  const subscription = native.addListener('onOfflineNearby', ({ deviceId, rssi }) => {
    if (done) return;
    sightings.set(deviceId, Math.max(rssi, sightings.get(deviceId) ?? -127));
    if (timer || rssi < OFFLINE_MIN_RSSI) return;
    timer = setTimeout(() => {
      const nearest = pickNearest(sightings);
      if (!nearest || done) return;
      stop();
      onFound(nearest);
    }, SETTLE_MS);
  });
  try {
    await native.startOfflineLooking();
  } catch (error) {
    subscription.remove();
    throw error;
  }
  return stop;
}

/** Connects to the receiver and returns its offer as text. */
export async function readOffer(deviceId: string): Promise<string> {
  return fromBase64(await requireNative().connectOffline(deviceId));
}

/** Sends the payment over the open link and returns the receiver's answer. */
export async function sendPayment(payment: string): Promise<HumAnswer> {
  const native = requireNative();
  try {
    return decodeAnswer(fromBase64(await native.sendOfflinePayment(toBase64(payment))));
  } finally {
    void native.disconnectOffline().catch(() => undefined);
  }
}

export function disconnect(): void {
  void FaaraBle?.disconnectOffline().catch(() => undefined);
}

export interface ReceiverHandlers {
  /** A payer connected and read the offer; show the shapes. */
  onPayer: (deviceId: string) => void;
  /** A payment arrived; check it and say what happened. */
  onPayment: (payment: string) => Promise<HumAnswer>;
}

/**
 * Serves `offer` to nearby payers until the returned function is called. Calling again with a
 * new offer replaces it.
 */
export async function startReceiving(
  offer: string,
  handlers: ReceiverHandlers,
): Promise<() => void> {
  const native = requireNative();
  const subscriptions = [
    native.addListener('onOfflineOfferRead', ({ deviceId }) => handlers.onPayer(deviceId)),
    native.addListener('onOfflinePayment', ({ deviceId, payload }) => {
      void handlers
        .onPayment(fromBase64(payload))
        .catch((error: unknown): HumAnswer => ({
          ok: false,
          reason: error instanceof Error ? error.message : 'It didn’t go through.',
        }))
        .then((answer) => native.answerOffline(deviceId, toBase64(encodeAnswer(answer))))
        .catch(() => undefined);
    }),
  ];
  try {
    await native.startOfflineReceiving(toBase64(offer));
  } catch (error) {
    subscriptions.forEach((s) => s.remove());
    throw error;
  }
  return () => {
    subscriptions.forEach((s) => s.remove());
    void native.stopOfflineReceiving().catch(() => undefined);
  };
}

/** Swaps in a fresh offer while already receiving (after each payment, for a new nonce). */
export async function replaceOffer(offer: string): Promise<void> {
  await requireNative().startOfflineReceiving(toBase64(offer));
}
