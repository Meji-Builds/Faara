import { useRouter } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Header, OtpField, PhoneField, Screen } from '@/components/ui';
import { isCompletePhoneNumber, maskPhone } from '@/lib/phone';
import { useTheme } from '@/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function LogInScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const codeSent = isCompletePhoneNumber(phone);

  useEffect(() => {
    if (!codeSent || secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [codeSent, secondsLeft]);

  const goHome = () => router.replace('/home');
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <Screen
      footer={
        <>
          <Button label="Log in" disabled={code.length !== CODE_LENGTH} onPress={goHome} />
          <Button
            label="Use fingerprint instead"
            variant="text"
            icon={<Fingerprint size={22} color={colors.accentText} strokeWidth={1.75} />}
            onPress={goHome}
          />
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
            <OtpField value={code} onChangeText={setCode} length={CODE_LENGTH} />
            {secondsLeft > 0 ? (
              <AppText variant="body" color="textMuted">
                Resend code in{' '}
                <AppText variant="bodyStrong" color="gold">
                  {countdown}
                </AppText>
              </AppText>
            ) : (
              <AppText
                variant="bodyStrong"
                color="accentText"
                accessibilityRole="button"
                onPress={() => setSecondsLeft(RESEND_SECONDS)}
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
