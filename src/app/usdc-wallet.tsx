import { Redirect } from 'expo-router';

/** The separate USDC wallet is now part of the dollar wallet; old links land there. */
export default function UsdcWalletScreen() {
  return <Redirect href="/wallet" />;
}
