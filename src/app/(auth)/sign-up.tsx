import { Link, useRouter } from 'expo-router';
import { Check, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Checkbox, Header, PhoneField, Screen, TextField } from '@/components/ui';
import {
  authErrorMessage,
  createProfile,
  isUsernameAvailable,
  requestPhoneCode,
  useAuth,
  USERNAME_PATTERN,
} from '@/features/auth';
import { isCompletePhoneNumber } from '@/lib/phone';
import { fonts, useTheme } from '@/theme';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'unknown';

const CHECK_DELAY_MS = 400;

export default function SignUpScreen() {
  const router = useRouter();
  const { status, user, signOut, setPending } = useAuth();
  // Phone already verified but the profile was never created (e.g. app closed mid sign-up).
  const finishing = status === 'needsProfile' && user !== null;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [agreed, setAgreed] = useState(false);
  // Result of the latest availability lookup, keyed by the username it was for.
  const [lookup, setLookup] = useState<{ username: string; result: Availability } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = USERNAME_PATTERN.test(username);
  const availability: Availability = !usernameValid
    ? 'idle'
    : lookup?.username === username
      ? lookup.result
      : 'checking';

  useEffect(() => {
    if (!usernameValid) return;
    let cancelled = false;
    const record = (result: Availability) => {
      if (!cancelled) setLookup({ username, result });
    };
    const timer = setTimeout(() => {
      isUsernameAvailable(username)
        .then((free) => record(free ? 'available' : 'taken'))
        // If the check can't run, allow submitting; the server re-checks atomically.
        .catch(() => record('unknown'));
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, usernameValid]);

  const usernameOk = availability === 'available' || availability === 'unknown';
  const canSubmit =
    fullName.trim().length > 1 &&
    (finishing || isCompletePhoneNumber(phone)) &&
    usernameOk &&
    agreed;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (finishing) {
        await createProfile(user.uid, { fullName, username, phone: user.phoneNumber ?? '' });
        router.replace('/home');
      } else {
        const pending = await requestPhoneCode(phone);
        setPending({ ...pending, signUp: { fullName: fullName.trim(), username } });
        router.push('/verify');
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
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
            label={finishing ? 'Create account' : 'Send code'}
            disabled={!canSubmit}
            loading={submitting}
            onPress={submit}
          />
          {finishing ? (
            <Button label="Use a different number" variant="text" onPress={signOut} />
          ) : (
            <AppText variant="body" color="textMuted" align="center">
              Already on Faara?{' '}
              <Link href="/log-in" replace>
                <AppText variant="bodyStrong" color="accentText">
                  Log in
                </AppText>
              </Link>
            </AppText>
          )}
        </>
      }
    >
      <Header
        hideBack={finishing}
        right={
          <AppText variant="label" color="textMuted">
            {finishing ? 'Almost done' : 'Step 1 of 3'}
          </AppText>
        }
      />
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          {finishing ? 'Finish your account' : 'Create your account'}
        </AppText>
        <AppText color="textMuted">
          {finishing
            ? `Your number ${user.phoneNumber ?? ''} is verified. Add your name and username.`
            : "We'll text you a code to confirm your number."}
        </AppText>
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
          maxLength={80}
        />
        {finishing ? null : <PhoneField value={phone} onChangeText={setPhone} />}
        <TextField
          label="Username"
          value={username}
          onChangeText={(text) =>
            setUsername(
              text
                .toLowerCase()
                .replace(/[^a-z0-9._]/g, '')
                .slice(0, 20),
            )
          }
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
            <UsernameHint username={username} valid={usernameValid} availability={availability} />
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

interface UsernameHintProps {
  username: string;
  valid: boolean;
  availability: Availability;
}

function UsernameHint({ username, valid, availability }: UsernameHintProps) {
  const { colors } = useTheme();
  if (!username) return null;
  if (!valid || availability === 'taken') {
    return (
      <View style={styles.hint}>
        <TriangleAlert size={16} color={colors.gold} strokeWidth={2} />
        <AppText variant="label" color="gold" style={styles.hintText}>
          {availability === 'taken'
            ? `@${username} is taken. Try another.`
            : 'Use at least 3 characters: letters, numbers, dots or underscores.'}
        </AppText>
      </View>
    );
  }
  if (availability === 'checking') {
    return (
      <AppText variant="label" color="textMuted" style={styles.hintIndent}>
        Checking @{username}…
      </AppText>
    );
  }
  return (
    <View style={styles.hint}>
      <Check size={16} color={colors.accentText} strokeWidth={2.5} />
      <AppText variant="label" color="accentText" style={styles.hintText}>
        {availability === 'available' ? 'Available. ' : ''}Friends can find you as @{username}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginTop: 24 },
  form: { gap: 20, marginTop: 28, paddingBottom: 24 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 2 },
  hintIndent: { marginLeft: 2 },
  hintText: { fontFamily: fonts.bodySemiBold, flexShrink: 1 },
  link: { textDecorationLine: 'underline' },
});
