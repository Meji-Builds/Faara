import * as LocalAuthentication from 'expo-local-authentication';

/** True when the device has biometrics set up that can approve payments. */
export async function canUseBiometrics(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

/** Shows the system fingerprint/face prompt. Resolves true only on success. */
export async function confirmWithBiometrics(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Use PIN',
    disableDeviceFallback: true,
  });
  return result.success;
}
