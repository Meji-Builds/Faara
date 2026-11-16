import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { auth } from '@/lib/firebase';

import type { PendingVerification } from './phoneAuth';
import { watchProfile, type UserProfile } from './profiles';

/**
 * - `loading`: restoring the session
 * - `signedOut`: no Firebase user
 * - `needsProfile`: phone verified but no Faara profile yet (sign-up not finished)
 * - `ready`: signed in with a profile
 */
export type AuthStatus = 'loading' | 'signedOut' | 'needsProfile' | 'ready';

/** Details collected on sign-up step 1, used after the code is verified. */
export interface SignUpDetails {
  fullName: string;
  username: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  /** A code request in progress, shared between the request and verify screens. */
  pending: (PendingVerification & { signUp?: SignUpDetails }) | null;
  setPending: (pending: AuthContextValue['pending']) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userResolved, setUserResolved] = useState(false);
  // Latest profile snapshot, tagged with the uid it belongs to.
  const [snapshot, setSnapshot] = useState<{ uid: string; profile: UserProfile | null } | null>(
    null,
  );
  const [pending, setPending] = useState<AuthContextValue['pending']>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next);
        setUserResolved(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return watchProfile(
      uid,
      (profile) => setSnapshot({ uid, profile }),
      // Treat a read failure as "no profile" so the user can retry sign-up rather than hang.
      () => setSnapshot({ uid, profile: null }),
    );
  }, [user]);

  const profileResolved = user !== null && snapshot?.uid === user.uid;
  const profile = profileResolved ? (snapshot?.profile ?? null) : null;

  const signOut = useCallback(async () => {
    setPending(null);
    await firebaseSignOut(auth);
  }, []);

  const status: AuthStatus = !userResolved
    ? 'loading'
    : !user
      ? 'signedOut'
      : !profileResolved
        ? 'loading'
        : profile
          ? 'ready'
          : 'needsProfile';

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, profile, pending, setPending, signOut }),
    [status, user, profile, pending, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** The signed-in profile. Only use on screens behind the `ready` guard. */
export function useProfile(): UserProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useProfile used without a signed-in profile.');
  return profile;
}
