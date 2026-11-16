import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Header, OtpField, Screen } from '@/components/ui';
import { authErrorMessage, createProfile, requestPhoneCode, useAuth } from '@/features/auth';
import { maskPhone, normalizePhoneInput } from '@/lib/phone';
import { useCountdown } from '@/lib/useCountdown';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

/** Sign-up step 2: confirm the number with the code, then create the profile. */
export default function VerifyScreen() {
  const router = useRouter();
  const { status, pending, setPending, refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resend = useCountdown(RESEND_SECONDS);
  const { restart } = resend;

  useEffect(() => {
    restart();
  }, [restart]);

  useEffect(() => {
    if (status !== 'ready') return;
    setPending(null);
    router.replace('/');
  }, [status, router, setPending]);

  if (!pending?.signUp) return <Redirect href="/sign-up" />;
  const { signUp, phoneE164 } = pending;

  const verify = async () => {
    setError(null);
    setVerifying(true);
    try {
      const credential = await pending.confirm(code);
      await createProfile(credential.user.uid, { ...signUp, phone: phoneE164 });
      // Stay busy: Home opens once the new profile is read back (effect above).
      refreshProfile();
    } catch (cause) {
      setError(authErrorMessage(cause));
      setVerifying(false);
    }
  };

  const resendCode = async () => {
    setError(null);
    try {
      const next = await requestPhoneCode(phoneE164);
      setPending({ ...next, signUp });
      setCode('');
      resend.restart();
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          <Button
            label="Verify"
            disabled={code.length !== CODE_LENGTH}
            loading={verifying}
            onPress={verify}
          />
        </>
      }
    >
      <Header
        right={
          <AppText variant="label" color="textMuted">
            Step 2 of 3
          </AppText>
        }
      />
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Enter the code
        </AppText>
        <AppText color="textMuted">
          We sent a {CODE_LENGTH}-digit code to {maskPhone(normalizePhoneInput(phoneE164))}.
        </AppText>
      </View>
      <View style={styles.form}>
        <OtpField value={code} onChangeText={setCode} length={CODE_LENGTH} autoFocus />
        {resend.remaining > 0 ? (
          <AppText variant="body" color="textMuted">
            Resend code in{' '}
            <AppText variant="bodyStrong" color="gold">
              {resend.label}
            </AppText>
          </AppText>
        ) : (
          <AppText
            variant="bodyStrong"
            color="accentText"
            accessibilityRole="button"
            onPress={resendCode}
          >
            Resend code
          </AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginTop: 24 },
  form: { gap: 16, marginTop: 28 },
});
