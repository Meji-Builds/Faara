import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemeOption } from '@/components/settings/ThemeOption';
import { AppText, BackButton, Card, ListRow, Screen, Toggle } from '@/components/ui';
import { usePreferences, type HumVolume } from '@/features/preferences';
import { useTheme, type ThemePreference } from '@/theme';

const THEME_OPTIONS: ThemePreference[] = ['dark', 'light', 'system'];

type ToggleKey =
  'readyToReceive' | 'payWithFingerprint' | 'hideBalances' | 'notifyMoneyReceived' | 'notifyOffers';

const VOLUME_ORDER: HumVolume[] = ['quiet', 'normal', 'loud'];
const VOLUME_LABEL: Record<HumVolume, string> = { quiet: 'Quiet', normal: 'Normal', loud: 'Loud' };

export default function SettingsScreen() {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const { preferences, setPreference: setAppPreference } = usePreferences();

  const toggle = (key: ToggleKey, label: string) => (
    <Toggle
      value={preferences[key]}
      onValueChange={(value) => setAppPreference(key, value)}
      accessibilityLabel={label}
    />
  );

  const cycleVolume = () => {
    const index = VOLUME_ORDER.indexOf(preferences.humVolume);
    setAppPreference('humVolume', VOLUME_ORDER[(index + 1) % VOLUME_ORDER.length] as HumVolume);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title" accessibilityRole="header">
          Settings
        </AppText>
      </View>

      <Section title="Hum">
        <Card divided>
          <ListRow
            label="Open the app ready to receive"
            trailing={toggle('readyToReceive', 'Open the app ready to receive')}
          />
          <ListRow
            label="Hum volume"
            value={VOLUME_LABEL[preferences.humVolume]}
            onPress={cycleVolume}
          />
        </Card>
      </Section>

      <Section title="Security">
        <Card divided>
          <ListRow
            label="Pay with fingerprint"
            trailing={toggle('payWithFingerprint', 'Pay with fingerprint')}
          />
          <ListRow
            label="Hide balances on Home"
            trailing={toggle('hideBalances', 'Hide balances on Home')}
          />
          <ListRow label="Change PIN" onPress={() => undefined} />
        </Card>
      </Section>

      <Section title="Appearance">
        <View style={styles.themeRow} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => (
            <ThemeOption
              key={option}
              option={option}
              selected={preference === option}
              onSelect={setPreference}
            />
          ))}
        </View>
      </Section>

      <Section title="Notifications">
        <Card divided>
          <ListRow
            label="Money received"
            trailing={toggle('notifyMoneyReceived', 'Money received notifications')}
          />
          <ListRow
            label="Offers and news"
            trailing={toggle('notifyOffers', 'Offers and news notifications')}
          />
        </Card>
      </Section>

      {/* Internal test tools during the build-out; remove before public release. */}
      <Section title="Developer">
        <Card divided>
          <ListRow
            label="Sound lab"
            value="Hum test bench"
            onPress={() => router.push('/lab/sound')}
          />
          <ListRow label="Hum ring lab" onPress={() => router.push('/lab/code')} />
        </Card>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="textMuted" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10 },
  themeRow: { flexDirection: 'row', gap: 12 },
});
