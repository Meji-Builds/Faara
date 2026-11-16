import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth';
import { useWallet } from '@/features/wallet';

/** Entry route: sends people to the right step for their account and this device. */
export default function Index() {
  const { status } = useAuth();
  const { status: walletStatus } = useWallet();
  if (status === 'needsProfile') return <Redirect href="/sign-up" />;
  if (status !== 'ready') return <Redirect href="/welcome" />;
  if (walletStatus === 'needsWallet') return <Redirect href="/setup-wallet" />;
  if (walletStatus === 'needsRestore') return <Redirect href="/restore-wallet" />;
  return <Redirect href="/home" />;
}
