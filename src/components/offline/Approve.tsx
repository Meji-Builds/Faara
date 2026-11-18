import { Fingerprint } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, OtpField } from '@/components/ui';
import { PIN_LENGTH, useApproval } from '@/features/wallet';
import { friendlyError } from '@/lib/errors';
import { palette, useTheme } from '@/theme';

interface ApproveProps {
  /** What is being approved, e.g. "Pay ₦2,000 to Tolu". */
  reason: string;
  /** Runs with the unlocked signing key. Throw to show an error and stay. */
  onApproved: (secretKey: Uint8Array) => Promise<void>;
}

/** Fingerprint or PIN approval that unlocks the phone's signing key. */
export function Approve({ reason, onApproved }: ApproveProps) {
  const { colors } = useTheme();
  const { biometricsEnabled, approveWithBiometrics, approveWithPin } = useApproval();
  const [usePin, setUsePin] = useState(!biometricsEnabled);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (unlock: () => Promise<{ secretKey: Uint8Array } | null>) => {
    setBusy(true);
    setError(null);
    try {
      const key = await unlock();
      if (!key) {
        setUsePin(true);
        return;
      }
      await onApproved(key.secretKey);
    } catch (cause) {
      setError(friendlyError(cause, cause instanceof Error ? cause.message : 'Try again.'));
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {error ? (
        <AppText variant="label" color="gold" align="center">
          {error}
        </AppText>
      ) : null}
      {usePin ? (
        <>
          <AppText variant="label" color="textMuted" align="center">
            Enter your PIN. {reason}
          </AppText>
          <OtpField
            value={pin}
            onChangeText={(next) => {
              setPin(next);
              if (next.length === PIN_LENGTH) void run(() => approveWithPin(next));
            }}
            length={PIN_LENGTH}
            secure
            autoFocus
            accessibilityLabel="PIN"
          />
        </>
      ) : (
        <>
          <Button
            label="Confirm with fingerprint"
            icon={<Fingerprint size={20} color={palette.nearBlack} strokeWidth={1.75} />}
            onPress={() => run(() => approveWithBiometrics(reason))}
          />
          <Button label="Use PIN instead" variant="text" onPress={() => setUsePin(true)} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  busy: { paddingVertical: 24, alignItems: 'center' },
});
