import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { VENDOR_CATEGORIES, type VendorCategory } from '@shared/vendors';

import { AppText, Button, Card, Checkbox, Header, Screen, TextField } from '@/components/ui';
import { applyToBeVendor } from '@/features/vendors';
import { friendlyError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { radii, useTheme } from '@/theme';

type Step = 'business' | 'identity' | 'terms';
const STEPS: Step[] = ['business', 'identity', 'terms'];
const TITLES: Record<Step, string> = {
  business: 'Your business',
  identity: 'Your identity',
  terms: 'Vendor terms',
};

const TERMS = [
  'The business details you give are true, and you’ll keep them up to date.',
  'You only take payments for real goods and services you sell yourself.',
  'You won’t receive money on behalf of other people or other businesses.',
  'You’ll handle refunds and disputes with customers honestly.',
  'Faara may ask for more documents, and may pause vendor payments if the account is misused.',
  'Vendor payments are free during the pilot. Fees, if any, will be announced before they start.',
];

/** The vendor application: business details, identity, then the terms. */
export default function VendorApplyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('business');
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [nin, setNin] = useState('');
  const [cacNumber, setCacNumber] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ninDigits = nin.replace(/\D/g, '');
  const ready: Record<Step, boolean> = {
    business:
      businessName.trim().length >= 3 &&
      category !== null &&
      location.trim().length >= 5 &&
      description.trim().length >= 10,
    identity: ninDigits.length === 11,
    terms: agreed,
  };
  const index = STEPS.indexOf(step);

  const submit = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      await applyToBeVendor({
        businessName,
        category,
        location,
        description,
        nin: ninDigits,
        cacNumber,
        agreedToTerms: agreed,
      });
      haptics.success();
      router.replace('/vendor');
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t send your application. Try again.'));
    } finally {
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
          {step === 'terms' ? (
            <Button label="Send application" disabled={!agreed} loading={busy} onPress={submit} />
          ) : (
            <Button
              label="Continue"
              disabled={!ready[step]}
              onPress={() => setStep(STEPS[index + 1] ?? step)}
            />
          )}
          {index > 0 ? (
            <Button label="Back" variant="text" onPress={() => setStep(STEPS[index - 1] ?? step)} />
          ) : null}
        </>
      }
    >
      <Header center={<AppText variant="subheading">Become a vendor</AppText>} />
      <AppText variant="label" color="textMuted" style={styles.progress}>
        Step {index + 1} of {STEPS.length} · {TITLES[step]}
      </AppText>

      {step === 'business' ? (
        <View style={styles.form}>
          <TextField
            label="Business name"
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Mama Tolu Foods"
          />
          <View style={styles.group}>
            <AppText variant="label" color="textMuted">
              What do you sell?
            </AppText>
            <View style={styles.chips}>
              {VENDOR_CATEGORIES.map((option) => {
                const selected = option === category;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(option)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.accent : colors.surface,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <AppText variant="label" color={selected ? 'onAccent' : 'text'}>
                      {option}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextField
            label="Where customers find you"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Beside the main gate, OOU Ago-Iwoye"
          />
          <TextField
            label="What your business does"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Rice, beans and swallow for students"
            multiline
          />
        </View>
      ) : null}

      {step === 'identity' ? (
        <View style={styles.form}>
          <AppText color="textMuted">
            Vendors must be real, identifiable people. Your NIN is used to check who you are. Faara
            keeps only its last four digits; the full number is never stored.
          </AppText>
          <TextField
            label="NIN (National Identification Number)"
            value={nin}
            onChangeText={(text) => setNin(text.replace(/[^\d ]/g, '').slice(0, 13))}
            placeholder="11 digits"
            keyboardType="number-pad"
          />
          <TextField
            label="CAC registration number (optional)"
            value={cacNumber}
            onChangeText={setCacNumber}
            placeholder="e.g. BN 1234567, if your business is registered"
            autoCapitalize="characters"
          />
        </View>
      ) : null}

      {step === 'terms' ? (
        <View style={styles.form}>
          <Card padded style={styles.terms}>
            {TERMS.map((term) => (
              <AppText key={term}>• {term}</AppText>
            ))}
          </Card>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            accessibilityLabel="I agree to the vendor terms, and my details are true."
          >
            <AppText>I agree to the vendor terms, and my details are true.</AppText>
          </Checkbox>
          <AppText variant="caption" color="textMuted">
            Faara’s team reviews every application, usually within two working days. We may contact
            you or visit your business before approving it.
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { marginTop: 12 },
  form: { gap: 16, marginTop: 16, paddingBottom: 24 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  terms: { gap: 10 },
});
