/** Biometric approval is native-only; the web uses the PIN. */
export async function canUseBiometrics(): Promise<boolean> {
  return false;
}

export async function confirmWithBiometrics(): Promise<boolean> {
  return false;
}
