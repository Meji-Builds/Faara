import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface PayloadEvent {
  /** Base64 service data from a Faara advertisement. */
  payload: string;
  rssi: number;
}

export interface OfflineNearbyEvent {
  deviceId: string;
  rssi: number;
}

export interface OfflinePaymentEvent {
  deviceId: string;
  /** Base64 bytes of the payer's payment. */
  payload: string;
}

interface FaaraBleNativeModule {
  getState(): 'unsupported' | 'off' | 'on';
  canAdvertise(): boolean;
  startAdvertising(payloadBase64: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  /** Receiver: serve this offer (base64) to nearby payers and advertise. */
  startOfflineReceiving(offerBase64: string): Promise<void>;
  /** Receiver: tell a connected payer what happened to their payment (base64). */
  answerOffline(deviceId: string, resultBase64: string): Promise<void>;
  stopOfflineReceiving(): Promise<void>;
  /** Payer: look for phones ready to receive. */
  startOfflineLooking(): Promise<void>;
  stopOfflineLooking(): Promise<void>;
  /** Payer: connect and read the receiver's offer (base64). */
  connectOffline(deviceId: string): Promise<string>;
  /** Payer: send the payment (base64); resolves with the receiver's answer (base64). */
  sendOfflinePayment(paymentBase64: string): Promise<string>;
  disconnectOffline(): Promise<void>;
  addListener(eventName: 'onPayload', listener: (event: PayloadEvent) => void): EventSubscription;
  addListener(
    eventName: 'onOfflineNearby',
    listener: (event: OfflineNearbyEvent) => void,
  ): EventSubscription;
  addListener(
    eventName: 'onOfflineOfferRead',
    listener: (event: { deviceId: string }) => void,
  ): EventSubscription;
  addListener(
    eventName: 'onOfflinePayment',
    listener: (event: OfflinePaymentEvent) => void,
  ): EventSubscription;
}

/** Null on web, iOS, Expo Go, or builds made before the module was added. */
export const FaaraBle = requireOptionalNativeModule<FaaraBleNativeModule>('FaaraBle');
