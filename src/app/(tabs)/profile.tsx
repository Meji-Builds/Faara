import { useRouter } from 'expo-router';
import { Settings, ShieldCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { HumCode } from '@/components/brand';
import { AppText, Avatar, Button, Card, IconButton, ListRow, Screen } from '@/components/ui';
import { useAuth, useProfile } from '@/features/auth';
import { initials } from '@/lib/money';
import { maskPhone, normalizePhoneInput } from '@/lib/phone';
import { radii, useTheme } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const profile = useProfile();
  // Bank and wallet details are sample data until the BaaS partner and wallet are connected.

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          Profile
        </AppText>
        <IconButton
          accessibilityLabel="Settings"
          icon={<Settings size={22} color={colors.text} strokeWidth={1.75} />}
          onPress={() => router.push('/settings')}
        />
      </View>

      <View style={styles.identity}>
        <Avatar size={72} initials={initials(profile.fullName)} />
        <View style={styles.identityText}>
          <AppText variant="heading">{profile.fullName}</AppText>
          <AppText variant="body" color="textMuted">
            @{profile.username} · {maskPhone(normalizePhoneInput(profile.phone))}
          </AppText>
          <View style={styles.verified}>
            <ShieldCheck size={16} color={colors.accentText} strokeWidth={2} />
            <AppText variant="bodyStrong" color="accentText">
              Verified · Tier {profile.verificationTier}
            </AppText>
          </View>
        </View>
      </View>

      <Card tone="brand" padded style={styles.codeCard}>
        <View style={styles.codeText}>
          <AppText variant="heading" color="onBrand">
            Your Faara code
          </AppText>
          <AppText variant="body" color="onBrandMuted" style={styles.codeHint}>
            {"Let someone scan this when sound and Bluetooth can't connect."}
          </AppText>
        </View>
        <View style={styles.qr} accessibilityLabel="Your Faara QR code">
          <HumCode
            value={`https://faara.app/@${profile.username}`}
            size={96}
            animated={false}
            accessibilityLabel="Your Faara code"
          />
        </View>
      </Card>

      <Card divided style={styles.menu}>
        <ListRow label="Personal details" onPress={() => undefined} />
        <ListRow
          label="Limits and verification"
          value={`Tier ${profile.verificationTier}`}
          onPress={() => undefined}
        />
        <ListRow label="Linked bank account" value="Not linked" onPress={() => undefined} />
        <ListRow
          label="Dollar wallet (Solana)"
          value={
            <AppText variant="body" color="gold" style={styles.mono}>
              {profile.walletAddress
                ? `${profile.walletAddress.slice(0, 4)}…${profile.walletAddress.slice(-4)}`
                : 'Not set up'}
            </AppText>
          }
          onPress={() => router.push('/wallet')}
        />
        <ListRow label="Invite friends" onPress={() => undefined} />
        <ListRow label="Help and support" onPress={() => undefined} />
      </Card>

      <Button label="Log out" variant="text" onPress={signOut} style={styles.logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24 },
  identityText: { flex: 1, gap: 4 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24 },
  codeText: { flex: 1, gap: 8 },
  codeHint: { fontSize: 14, lineHeight: 20 },
  qr: { padding: 10, borderRadius: radii.md, backgroundColor: '#EAF7F2' },
  menu: { marginTop: 20 },
  mono: { fontSize: 14 },
  logout: { marginTop: 16, marginBottom: 24 },
});
