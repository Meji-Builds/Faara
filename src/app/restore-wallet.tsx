import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Header, Screen } from '@/components/ui';
import { PinSetup } from '@/components/wallet/PinSetup';
import { useAuth } from '@/features/auth';
import { isValidRecoveryPhrase, normalizePhrase, useWallet } from '@/features/wallet';
import { inputFocusReset } from '@/lib/platformStyles';
import { fonts, radii, useTheme } from '@/theme';

type Step = 'phrase' | 'pin' | 'new-wallet';

/** Shown when the account's dollar wallet isn't on this device (new phone or browser). */
export default function RestoreWalletScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const { restoreWallet, createWallet } = useWallet();
  const [step, setStep] = useState<Step>('phrase');
  const [phrase, setPhrase] = useState('');
  const valid = isValidRecoveryPhrase(phrase);

  if (step === 'pin' || step === 'new-wallet') {
    return (
      <Screen>
        <Header onBack={() => setStep('phrase')} />
        <PinSetup
          title={step === 'pin' ? 'Choose a PIN' : 'PIN for your new wallet'}
          busyLabel={step === 'pin' ? 'Restoring your wallet…' : 'Creating your wallet…'}
          onComplete={async (pin) => {
            if (step === 'pin') await restoreWallet(normalizePhrase(phrase), pin);
            else await createWallet(pin);
            router.replace('/');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label="Restore wallet" disabled={!valid} onPress={() => setStep('pin')} />
          <Button
            label="Create a new wallet instead"
            variant="text"
            onPress={() => setStep('new-wallet')}
          />
          <Button label="Log out" variant="text" onPress={signOut} />
        </>
      }
    >
      <Header hideBack />
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Restore your dollar wallet
        </AppText>
        <AppText color="textMuted">
          Your dollar wallet lives on the phone where you created it. To use it here, enter its
          12-word recovery phrase.
        </AppText>
      </View>
      <TextInput
        value={phrase}
        onChangeText={setPhrase}
        placeholder="word1 word2 word3 …"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        multiline
        accessibilityLabel="Recovery phrase"
        style={[
          styles.input,
          inputFocusReset,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />
      {phrase.trim() && !valid ? (
        <AppText variant="label" color="gold">
          Check the words: a recovery phrase is 12 words from the standard list.
        </AppText>
      ) : null}
      <AppText variant="label" color="textMuted" style={styles.warning}>
        Creating a new wallet gives you a new address. Dollars in the old wallet stay there and can
        only be reached with its recovery phrase.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8, marginTop: 24, marginBottom: 20 },
  input: {
    minHeight: 120,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  warning: { marginTop: 16, marginBottom: 24 },
});
