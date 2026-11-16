import { Redirect, useRouter } from 'expo-router';
import { ArrowRight, Fingerprint, ShieldQuestion } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ShapeGlyph } from '@/components/brand';
import { AppText, Avatar, Button, Card, Header, ListRow, Screen } from '@/components/ui';
import { freeTransfers } from '@/data/fixtures';
import { useHumDraft } from '@/features/hum';
import { CURRENCY_SYMBOL, groupDigits, initials } from '@/lib/money';
import { fonts, palette, radii, useTheme } from '@/theme';

export default function ConfirmScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { currency, amount, note, chosen } = useHumDraft();

  if (!chosen) return <Redirect href="/hum" />;

  const recipient = {
    name: chosen.recipient.fullName,
    firstName: chosen.recipient.fullName.split(/\s+/)[0] ?? chosen.recipient.fullName,
  };
  const amountText = groupDigits(currency === 'USDC' ? amount.toFixed(2) : String(amount));
  // Biometric / PIN approval and settlement arrive with milestones 4 and 6.
  const approve = () => router.replace('/hum/success');

  return (
    <Screen
      footer={
        <>
          <Button
            label="Confirm with fingerprint"
            icon={<Fingerprint size={24} color={palette.nearBlack} strokeWidth={1.75} />}
            onPress={approve}
          />
          <Button label="Use PIN instead" variant="text" onPress={approve} style={styles.pin} />
        </>
      }
    >
      <Header center={<AppText variant="subheading">Confirm</AppText>} />

      <View style={styles.parties} accessibilityLabel={`From you to ${recipient.name}`}>
        <View style={[styles.you, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="subheading" color="textMuted">
            You
          </AppText>
        </View>
        <ArrowRight size={36} color={colors.accent} strokeWidth={1.75} />
        <Avatar size={48} tone="soft" initials={initials(recipient.name)} />
      </View>

      <AppText align="center" style={[styles.amount, { color: colors.text }]}>
        <AppText
          style={[
            styles.amount,
            { color: scheme === 'dark' ? palette.softTeal : colors.accentText },
          ]}
        >
          {CURRENCY_SYMBOL[currency]}
        </AppText>
        {amountText}
      </AppText>
      <AppText color="textMuted" align="center">
        to{' '}
        <AppText variant="bodyStrong" color="text">
          {recipient.name}
        </AppText>
        {note ? ` · ${note}` : ''}
      </AppText>

      <Card tone="brand" padded style={styles.match}>
        <AppText variant="overline" color="onBrandMuted">
          MATCH WITH {recipient.firstName.toUpperCase()}&apos;S SCREEN
        </AppText>
        <View style={styles.shapes}>
          {chosen.shapes.map((shape, index) => (
            <View
              key={`${shape}-${index}`}
              style={[styles.shapeTile, { backgroundColor: colors.brandInset }]}
            >
              <ShapeGlyph shape={shape} size={34} />
            </View>
          ))}
        </View>
        <AppText variant="label" color="onBrand" style={styles.matchHint}>
          {recipient.firstName} sees the same three shapes. If they don&apos;t match, cancel.
        </AppText>
      </Card>

      <Card divided style={styles.details}>
        <ListRow
          compact
          label="Fee"
          labelColor="textMuted"
          value={
            <AppText variant="bodyStrong">
              Free{' '}
              <AppText color="textMuted">
                · {freeTransfers.used} of {freeTransfers.limit} this month
              </AppText>
            </AppText>
          }
        />
        <ListRow
          compact
          label="Arrives"
          labelColor="textMuted"
          value={<AppText variant="bodyStrong">Instantly</AppText>}
        />
        <ListRow
          compact
          label="Safety"
          labelColor="textMuted"
          value={
            <View style={styles.safety}>
              <ShieldQuestion size={18} color={colors.textMuted} strokeWidth={1.75} />
              <AppText variant="bodyStrong" color="textMuted">
                Not checked yet
              </AppText>
            </View>
          }
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  parties: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 20,
  },
  you: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 54,
    letterSpacing: -2,
    marginTop: 14,
  },
  match: { marginTop: 24, gap: 14 },
  shapes: { flexDirection: 'row', gap: 10 },
  shapeTile: {
    flex: 1,
    height: 76,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchHint: { fontSize: 14, lineHeight: 20, opacity: 0.92 },
  details: { marginTop: 16, marginBottom: 16 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pin: { marginTop: -4 },
});
