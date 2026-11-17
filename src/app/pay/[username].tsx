import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdireBand, Wordmark } from '@/components/brand';
import { AppText, Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { rememberPendingRecipient } from '@/features/referral';
import { useWallet } from '@/features/wallet';
import { useTheme } from '@/theme';

/**
 * Where a Faara code (or pay link) leads. Signed-in people go straight to Send, already
 * addressed to the owner. Everyone else is asked to join first, and picks up where they
 * left off once their account is ready.
 */
export default function PayLinkScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { status } = useAuth();
  const { status: walletStatus } = useWallet();
  const { username: raw } = useLocalSearchParams<{ username: string }>();
  const username = String(raw ?? '')
    .replace(/^@/, '')
    .toLowerCase();

  if (!/^[a-z0-9._]{3,20}$/.test(username)) return <Redirect href="/" />;

  if (status === 'loading' || (status === 'ready' && walletStatus === 'loading')) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === 'ready' && walletStatus === 'ready') {
    return <Redirect href={{ pathname: '/send', params: { to: username } }} />;
  }

  // Not ready to pay yet: remember who this was for, and let the usual set-up run.
  rememberPendingRecipient(username);
  if (status !== 'signedOut') return <Redirect href="/" />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AdireBand color={scheme === 'dark' ? colors.brandLine : colors.ring} />
      <Screen
        scroll={false}
        footer={
          <>
            <Button label="Create account" onPress={() => router.push('/sign-up')} />
            <Button label="Log in" variant="outline" onPress={() => router.push('/log-in')} />
          </>
        }
      >
        <Wordmark size={30} style={styles.wordmark} />
        <View style={styles.copy}>
          <AppText variant="overline" color="accentText">
            PAY ON FAARA
          </AppText>
          <AppText variant="title" accessibilityRole="header" style={styles.headline}>
            Pay
          </AppText>
          <AppText
            variant="title"
            color="accentText"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.handle}
          >
            @{username}
          </AppText>
          <AppText color="textMuted">
            Join Faara in a minute and send money to @{username} right away.
          </AppText>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { marginTop: 20 },
  copy: { flex: 1, justifyContent: 'center', gap: 14 },
  headline: { fontSize: 44, lineHeight: 48, marginBottom: -8 },
  handle: { fontSize: 36, lineHeight: 44 },
});
