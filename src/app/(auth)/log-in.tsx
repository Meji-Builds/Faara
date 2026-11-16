import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Header, OtpField, PhoneField, Screen } from '@/components/ui';
import { authErrorMessage, requestPhoneCode, toE164, useAuth } from '@/features/auth';
import { isCompletePhoneNumber, maskPhone } from '@/lib/phone';
import { useCountdown } from '@/lib/useCountdown';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function LogInScreen() {
  const router = useRouter();
  const { status, pending, setPending } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resend = useCountdown(RESEND_SECONDS);

  // A code request for a different number (or from sign-up) doesn't apply here.
  const codeSent = pending !== null && !pending.signUp && pending.phoneE164 === toE164(phone);

  // After the code is accepted, route on whether this number has a Faara profile.
  useEffect(() => {
    if (!confirmed) return;
    if (status === 'ready') router.replace('/home');
    if (status === 'needsProfile') router.replace('/sign-up');
  }, [confirmed, status, router]);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      setPending(await requestPhoneCode(phone));
      setCode('');
      resend.restart();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const logIn = async () => {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      await pending.confirm(code);
      setPending(null);
      setConfirmed(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
      setBusy(false);
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
          {codeSent ? (
            <Button
              label="Log in"
              disabled={code.length !== CODE_LENGTH}
              loading={busy}
              onPress={logIn}
            />
          ) : (
            <Button
              label="Send code"
              disabled={!isCompletePhoneNumber(phone)}
              loading={busy}
              onPress={sendCode}
            />
          )}
        </>
      }
    >
      <Header />
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Welcome back
        </AppText>
        <AppText color="textMuted">Log in with your phone number.</AppText>
      </View>

      <View style={styles.form}>
        <PhoneField value={phone} onChangeText={setPhone} autoFocus />
        {codeSent ? (
          <View style={styles.codeBlock}>
            <AppText variant="label" color="textMuted">
              Enter the {CODE_LENGTH}-digit code we sent to {maskPhone(phone)}
            </AppText>
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
                onPress={sendCode}
              >
                Resend code
              </AppText>
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginTop: 24 },
  form: { gap: 24, marginTop: 28 },
  codeBlock: { gap: 14 },
});
