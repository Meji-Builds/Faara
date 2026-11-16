export {
  AuthProvider,
  useAuth,
  useProfile,
  type AuthStatus,
  type SignUpDetails,
} from './AuthProvider';
export { authErrorMessage, UsernameTakenError } from './errors';
export { requestPhoneCode, toE164, type PendingVerification } from './phoneAuth';
export {
  createProfile,
  isUsernameAvailable,
  setWalletAddress,
  USERNAME_PATTERN,
  type UserProfile,
} from './profiles';
