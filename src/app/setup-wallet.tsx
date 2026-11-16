import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Header, Screen } from '@/components/ui';
import { PinSetup } from '@/components/wallet/PinSetup';
import { useWallet } from '@/features/wallet';
import { useTheme } from '@/theme';

/** Sign-up step 3: choose a PIN; the dollar wallet is created on this device. */
export default function SetupWalletScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { createWallet } = useWallet();

  return (
    <Screen>
      <Header
        hideBack
        right={
          <AppText variant="label" color="textMuted">
            Step 3 of 3
          </AppText>
        }
      />
      <PinSetup
        busyLabel="Creating your wallet…"
        onComplete={async (pin) => {
          await createWallet(pin);
          router.replace('/');
        }}
      />
      <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
        <ShieldCheck size={20} color={colors.accentText} strokeWidth={1.75} />
        <AppText variant="label" color="textMuted" style={styles.noteText}>
          Your dollar wallet is created on this phone and its keys never leave it. Faara can’t move
          your dollars without your approval.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginTop: 28,
    marginBottom: 24,
  },
  noteText: { flex: 1, lineHeight: 19 },
});
