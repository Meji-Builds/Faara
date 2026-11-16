import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemeOption } from '@/components/settings/ThemeOption';
import { AppText, BackButton, Card, ListRow, Screen, Toggle } from '@/components/ui';
import { useTheme, type ThemePreference } from '@/theme';

const THEME_OPTIONS: ThemePreference[] = ['dark', 'light', 'system'];

/** Local-only preferences until settings sync to the user profile. */
interface Preferences {
  readyToReceive: boolean;
  payWithFingerprint: boolean;
  hideBalances: boolean;
  notifyMoneyReceived: boolean;
  notifyOffers: boolean;
}

export default function SettingsScreen() {
  const { preference, setPreference } = useTheme();
  const [prefs, setPrefs] = useState<Preferences>({
    readyToReceive: true,
    payWithFingerprint: true,
    hideBalances: false,
    notifyMoneyReceived: true,
    notifyOffers: false,
  });

  const toggle = (key: keyof Preferences, label: string) => (
    <Toggle
      value={prefs[key]}
      onValueChange={(value) => setPrefs((p) => ({ ...p, [key]: value }))}
      accessibilityLabel={label}
    />
  );

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
          <ListRow label="Hum volume" value="Quiet" onPress={() => undefined} />
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
