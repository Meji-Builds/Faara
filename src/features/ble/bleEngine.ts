import { FaaraBle } from '@modules/faara-ble';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import { bytesToBase64, base64ToBytes } from '@/features/sound/audio/pcm';

import { MIN_RSSI, packToken, unpackToken } from './payload';

export type BleAvailability = 'ready' | 'off' | 'unsupported' | 'not-in-build' | 'not-on-platform';

/** Whether Bluetooth hums can be used right now on this device. */
export function bleAvailability(): BleAvailability {
  if (Platform.OS !== 'android') return 'not-on-platform';
  if (!FaaraBle) return 'not-in-build';
  const state = FaaraBle.getState();
  return state === 'on' ? 'ready' : state;
}

/** Requests the runtime permissions Bluetooth LE needs on this Android version. */
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const version =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const permissions: Permission[] =
    version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export async function startBleBroadcast(token: string): Promise<void> {
  if (!FaaraBle) throw new Error('Bluetooth is not available in this build');
  await FaaraBle.startAdvertising(bytesToBase64(packToken(token)));
}

export async function stopBleBroadcast(): Promise<void> {
  await FaaraBle?.stopAdvertising().catch(() => undefined);
}

/**
 * Scans for hum advertisements. Calls `onToken` for each decoded code at or above the
 * minimum signal strength. Returns a function that stops scanning.
 */
export async function startBleScan(
  onToken: (token: string, rssi: number) => void,
): Promise<() => Promise<void>> {
  const native = FaaraBle;
  if (!native) throw new Error('Bluetooth is not available in this build');
  const subscription = native.addListener('onPayload', ({ payload, rssi }) => {
    if (rssi < MIN_RSSI) return;
    const token = unpackToken(base64ToBytes(payload));
    if (token) onToken(token, rssi);
  });
  try {
    await native.startScanning();
  } catch (error) {
    subscription.remove();
    throw error;
  }
  return async () => {
    subscription.remove();
    await native.stopScanning().catch(() => undefined);
  };
}
