import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdireBand, Wordmark } from '@/components/brand';
import { HumPulse } from '@/components/hum';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();

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
        <View style={styles.hero}>
          <HumPulse size={130} active={false} />
        </View>
        <View style={styles.copy}>
          <AppText variant="title" accessibilityRole="header" style={styles.headline}>
            Pay anyone nearby. Just hold phones close.
          </AppText>
          <AppText color="textMuted">
            Naira and dollars in one app. Works on any phone, no NFC needed.
          </AppText>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wordmark: { marginTop: 20 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 14, marginBottom: 20 },
  headline: { fontSize: 38, lineHeight: 42 },
});
