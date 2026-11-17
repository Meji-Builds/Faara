import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Header, OtpField, Screen } from '@/components/ui';
import { PinSetup } from '@/components/wallet/PinSetup';
import { PIN_LENGTH, useWallet } from '@/features/wallet';

/** Settings → Change PIN: confirm the current passcode, then choose a new one. */
export default function ChangePinScreen() {
  const router = useRouter();
  const { changePin, unlockKeypair } = useWallet();
  const [current, setCurrent] = useState('');
  const [verified, setVerified] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    setError(null);
    try {
      await unlockKeypair(current); // throws for a wrong PIN or during lockout
      setVerified(current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wrong PIN.');
      setCurrent('');
    } finally {
      setChecking(false);
    }
  };

  if (verified) {
    return (
      <Screen>
        <Header onBack={() => setVerified(null)} />
        <PinSetup
          title="Choose a new PIN"
          busyLabel="Saving…"
          onComplete={async (pin) => {
            await changePin(verified, pin);
            router.back();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <View style={styles.body}>
        <View style={styles.intro}>
          <AppText variant="title" accessibilityRole="header">
            Enter your current PIN
          </AppText>
          <AppText color="textMuted">
            This is the passcode you use to open Faara and approve payments.
          </AppText>
        </View>
        <OtpField
          value={current}
          onChangeText={setCurrent}
          length={PIN_LENGTH}
          secure
          autoFocus
          accessibilityLabel="Current PIN"
        />
        {error ? (
          <AppText variant="label" color="gold">
            {error}
          </AppText>
        ) : null}
        <Button
          label="Continue"
          disabled={current.length !== PIN_LENGTH}
          loading={checking}
          onPress={verify}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  intro: { gap: 6, marginTop: 24 },
});
