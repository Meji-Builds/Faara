/** Biometric approval is native-only; the web uses the PIN. */
export async function canUseBiometrics(): Promise<boolean> {
  return process.env.EXPO_PUBLIC_DEMO === '1';
}

export async function confirmWithBiometrics(): Promise<boolean> {
  if (process.env.EXPO_PUBLIC_DEMO !== '1') return false;
  await new Promise((resolve) => setTimeout(resolve, 900));
  return true;
}
