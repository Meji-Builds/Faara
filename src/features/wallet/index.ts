export { canUseBiometrics, confirmWithBiometrics } from './biometrics';
export { isValidRecoveryPhrase, normalizePhrase } from './keys';
export { PIN_LENGTH, PinLockedError, WrongPinError } from './vault.types';
export { useWallet, WalletProvider, type WalletStatus } from './WalletProvider';
export { useApproval } from './useApproval';
export { sendUsdc, solanaErrorMessage } from './payments';
export { getSolBalance, getUsdcBalance, requestTestSol, TEST_FUNDS_LINKS } from './solana';
