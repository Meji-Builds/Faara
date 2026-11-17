import { Fingerprint } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdireBand, Wordmark } from '@/components/brand';
import { friendlyError } from '@/lib/errors';
import { AppText, Avatar, Button, OtpField } from '@/components/ui';
import { PIN_LENGTH } from '@/features/wallet';
import { initials } from '@/lib/money';
import { SCREEN_GUTTER, useTheme } from '@/theme';

interface LockScreenProps {
  fullName: string;
  /** Offer the fingerprint button (and prompt once on open). */
  biometrics: boolean;
  /** Rejects with a message to show (wrong PIN, locked out). */
  onPin: (pin: string) => Promise<void>;
  onBiometrics: () => Promise<boolean>;
  onLogOut: () => void;
}

/** Passcode gate shown over the app when it opens or returns after a while. */
export function LockScreen({
  fullName,
  biometrics,
  onPin,
  onBiometrics,
  onLogOut,
}: LockScreenProps) {
  const { colors, scheme } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const prompted = useRef(false);
  const firstName = fullName.split(/\s+/)[0] ?? fullName;

  // Offer the fingerprint straight away, once.
  useEffect(() => {
    if (!biometrics || prompted.current) return;
    prompted.current = true;
    onBiometrics().catch(() => undefined);
  }, [biometrics, onBiometrics]);

  const submit = async (value: string) => {
    setChecking(true);
    setError(null);
    try {
      await onPin(value);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t check your passcode. Try again.'));
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  const change = (value: string) => {
    setPin(value);
    if (value.length === PIN_LENGTH && !checking) submit(value);
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
    >
      <AdireBand color={scheme === 'dark' ? colors.brandLine : colors.ring} />
      <SafeAreaView style={styles.safe}>
        <Wordmark size={28} />
        <View style={styles.body}>
          <Avatar size={72} initials={initials(fullName)} />
          <AppText variant="title" align="center" accessibilityRole="header">
            Welcome back, {firstName}
          </AppText>
          <AppText color="textMuted" align="center">
            Enter your passcode to open Faara.
          </AppText>
          <View style={styles.pin}>
            <OtpField
              value={pin}
              onChangeText={change}
              length={PIN_LENGTH}
              secure
              autoFocus={!biometrics}
              accessibilityLabel="Passcode"
            />
          </View>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
        </View>
        <View style={styles.footer}>
          {biometrics ? (
            <Button
              label="Use fingerprint"
              variant="outline"
              icon={<Fingerprint size={22} color={colors.text} strokeWidth={1.75} />}
              onPress={() => onBiometrics().catch(() => undefined)}
            />
          ) : null}
          <Button label="Log out" variant="text" onPress={onLogOut} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100 },
  safe: { flex: 1, paddingHorizontal: SCREEN_GUTTER, paddingTop: 20 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  pin: { alignSelf: 'stretch', marginTop: 16 },
  footer: { gap: 8, paddingBottom: 12 },
});
