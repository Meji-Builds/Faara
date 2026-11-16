import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface PayloadEvent {
  /** Base64 service data from a Faara advertisement. */
  payload: string;
  rssi: number;
}

interface FaaraBleNativeModule {
  getState(): 'unsupported' | 'off' | 'on';
  canAdvertise(): boolean;
  startAdvertising(payloadBase64: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  addListener(eventName: 'onPayload', listener: (event: PayloadEvent) => void): EventSubscription;
}

/** Null on web, iOS, Expo Go, or builds made before the module was added. */
export const FaaraBle = requireOptionalNativeModule<FaaraBleNativeModule>('FaaraBle');
