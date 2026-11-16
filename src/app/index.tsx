import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth';

/** Entry route: sends people to Home, to finish sign-up, or to Welcome. */
export default function Index() {
  const { status } = useAuth();
  if (status === 'ready') return <Redirect href="/home" />;
  if (status === 'needsProfile') return <Redirect href="/sign-up" />;
  return <Redirect href="/welcome" />;
}
