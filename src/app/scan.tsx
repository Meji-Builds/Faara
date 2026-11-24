import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { WaveScanner } from '@/components/hum';
import { AppText, Header, Screen } from '@/components/ui';

/**
 * Scan to pay: a shop's sticker or anyone's Faara code opens a payment to them, carrying over
 * any amount already typed. A hum ring or hum QR opens Receive, since that's someone paying.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { amount, note } = useLocalSearchParams<{ amount?: string; note?: string }>();

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Scan to pay</AppText>} />
      <View style={styles.body}>
        <AppText color="textMuted" align="center">
          Point the camera at a shop’s Faara sticker or someone’s Faara code.
        </AppText>
        <WaveScanner
          onToken={(token) =>
            router.replace({ pathname: '/receive', params: { token, channel: 'qr' } })
          }
          onLink={(link) =>
            link.kind === 'pay'
              ? router.replace({
                  pathname: '/send',
                  params: {
                    to: link.username,
                    ...(amount ? { amount } : {}),
                    ...(note ? { note } : {}),
                  },
                })
              : router.replace({ pathname: '/r/[id]', params: { id: link.id } })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 16 },
});
