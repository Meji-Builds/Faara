import { Link, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Checkbox, Header, PhoneField, Screen, TextField } from '@/components/ui';
import { isCompletePhoneNumber } from '@/lib/phone';
import { fonts, useTheme } from '@/theme';

const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;

export default function SignUpScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [agreed, setAgreed] = useState(false);

  const usernameValid = USERNAME_PATTERN.test(username);
  const canSubmit =
    fullName.trim().length > 1 && isCompletePhoneNumber(phone) && usernameValid && agreed;

  return (
    <Screen
      footer={
        <>
          <Button
            label="Send code"
            disabled={!canSubmit}
            // Phone verification arrives with Firebase Auth (milestone 2).
            onPress={() => router.replace('/home')}
          />
          <AppText variant="body" color="textMuted" align="center">
            Already on Faara?{' '}
            <Link href="/log-in" replace>
              <AppText variant="bodyStrong" color="accentText">
                Log in
              </AppText>
            </Link>
          </AppText>
        </>
      }
    >
      <Header
        right={
          <AppText variant="label" color="textMuted">
            Step 1 of 3
          </AppText>
        }
      />
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Create your account
        </AppText>
        <AppText color="textMuted">{"We'll text you a code to confirm your number."}</AppText>
      </View>

      <View style={styles.form}>
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ada Okafor"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
        />
        <PhoneField value={phone} onChangeText={setPhone} />
        <TextField
          label="Username"
          value={username}
          onChangeText={(text) => setUsername(text.toLowerCase().replace(/\s/g, ''))}
          placeholder="ada.ok"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          leading={
            <AppText variant="subheading" color="textMuted">
              @
            </AppText>
          }
          hint={
            usernameValid ? (
              <View style={styles.hint}>
                <Check size={16} color={colors.accentText} strokeWidth={2.5} />
                <AppText variant="label" color="accentText" style={styles.hintText}>
                  Available. Friends can find you as @{username}
                </AppText>
              </View>
            ) : null
          }
        />
        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          accessibilityLabel="Agree to the Terms and Privacy Policy"
        >
          <AppText color="textMuted">
            {"I agree to Faara's "}
            <AppText variant="bodyStrong" color="accentText" style={styles.link}>
              Terms
            </AppText>
            {' and '}
            <AppText variant="bodyStrong" color="accentText" style={styles.link}>
              Privacy Policy
            </AppText>
            .
          </AppText>
        </Checkbox>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginTop: 24 },
  form: { gap: 20, marginTop: 28, paddingBottom: 24 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 2 },
  hintText: { fontFamily: fonts.bodySemiBold },
  link: { textDecorationLine: 'underline' },
});
