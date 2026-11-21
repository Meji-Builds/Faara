import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';

import { amIAdmin } from './adminApi';

/** Whether the signed-in person is on Faara's team (false until known). */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{ uid: string; isAdmin: boolean } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    amIAdmin()
      .then((result) => active && setState({ uid, isAdmin: result.isAdmin }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [uid]);
  return state !== null && state.uid === uid && state.isAdmin;
}
