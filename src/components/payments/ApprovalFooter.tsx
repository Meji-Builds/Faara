import { Fingerprint } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Button, OtpField } from '@/components/ui';
import type { PayFlow } from '@/features/payments';
import { PIN_LENGTH } from '@/features/wallet';
import { palette } from '@/theme';

interface ApprovalFooterProps {
  flow: PayFlow;
  amountLabel: string;
  currency: 'NGN' | 'USDC';
  /** Extra actions under the main button (e.g. cancel). */
  secondary?: ReactNode;
  disabled?: boolean;
}

/** Footer for payment approval: fingerprint or PIN, progress and errors. */
export function ApprovalFooter({
  flow,
  amountLabel,
  currency,
  secondary,
  disabled = false,
}: ApprovalFooterProps) {
  const {
    stage,
    setStage,
    pin,
    setPin,
    error,
    biometricsEnabled,
    confirmWithFingerprint,
    confirmWithPin,
  } = flow;
  const paying = stage === 'paying';

  return (
    <>
      {error ? (
        <AppText variant="label" color="gold" align="center">
          {error}
        </AppText>
      ) : null}
      {paying ? (
        <AppText variant="label" color="textMuted" align="center">
          {currency === 'USDC' ? 'Sending on the Solana network…' : 'Paying…'}
        </AppText>
      ) : null}
      {stage === 'pin' ? (
        <>
          <AppText variant="label" color="textMuted" align="center">
            Enter your PIN to pay {amountLabel}
          </AppText>
          <OtpField
            value={pin}
            onChangeText={setPin}
            length={PIN_LENGTH}
            secure
            autoFocus
            accessibilityLabel="PIN"
          />
          <Button label="Pay" disabled={pin.length !== PIN_LENGTH} onPress={confirmWithPin} />
          {biometricsEnabled ? (
            <Button
              label="Use fingerprint instead"
              variant="text"
              onPress={confirmWithFingerprint}
            />
          ) : null}
        </>
      ) : biometricsEnabled ? (
        <>
          <Button
            label="Confirm with fingerprint"
            icon={<Fingerprint size={24} color={palette.nearBlack} strokeWidth={1.75} />}
            loading={paying}
            disabled={disabled}
            onPress={confirmWithFingerprint}
          />
          <Button
            label="Use PIN instead"
            variant="text"
            disabled={paying || disabled}
            onPress={() => setStage('pin')}
            style={styles.tight}
          />
          {secondary}
        </>
      ) : (
        <>
          <Button
            label="Confirm with PIN"
            loading={paying}
            disabled={disabled}
            onPress={() => setStage('pin')}
          />
          {secondary}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tight: { marginTop: -4 },
});
