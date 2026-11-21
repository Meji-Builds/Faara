import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Settings, ShieldCheck } from 'lucide-react-native';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText, Avatar, Button, Card, IconButton, ListRow, Screen } from '@/components/ui';
import {
  ASSISTANT_ENABLED,
  CONVERT_ENABLED,
  DOLLARS_ENABLED,
  OFFLINE_ENABLED,
} from '@/config/features';
import { useAuth, useProfile } from '@/features/auth';
import { useIsAdmin } from '@/features/admin';
import { useVendorStatus } from '@/features/vendors';
import { payLink } from '@/lib/links';
import { initials } from '@/lib/money';
import { maskPhone, normalizePhoneInput } from '@/lib/phone';
import { palette, radii, useTheme } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const profile = useProfile();
  const vendor = useVendorStatus();
  const isAdmin = useIsAdmin();

  const invite = async () => {
    const message = `Pay me on Faara: ${payLink(profile.username)}`;
    try {
      if (Platform.OS === 'web' && typeof navigator.share !== 'function') {
        await Clipboard.setStringAsync(message);
        return;
      }
      await Share.share({ message });
    } catch {
      // Dismissed the share sheet.
    }
  };

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
            {'Anyone who scans this can pay you, even if they’re not on Faara yet.'}
          </AppText>
        </View>
        <View style={styles.qr} accessibilityLabel="Your Faara QR code">
          <QRCode
            value={payLink(profile.username)}
            size={76}
            color={palette.deepGreen}
            backgroundColor="#EAF7F2"
          />
        </View>
      </Card>

      <Card divided style={styles.menu}>
        <ListRow label="Personal details" onPress={() => router.push('/personal-details')} />
        <ListRow
          label="Limits and verification"
          value={`Tier ${profile.verificationTier}`}
          onPress={() => router.push('/limits')}
        />
        {CONVERT_ENABLED ? (
          <ListRow label="USDC wallet" onPress={() => router.push('/usdc-wallet')} />
        ) : null}
        <ListRow
          label={vendor.status?.vendor ? 'Vendor dashboard' : 'Become a vendor'}
          value={
            vendor.status?.vendor
              ? vendor.status.vendor.businessName
              : vendor.status?.application?.status === 'pending'
                ? 'In review'
                : undefined
          }
          onPress={() => router.push('/vendor')}
        />
        {isAdmin ? <ListRow label="Admin" onPress={() => router.push('/admin')} /> : null}
        {ASSISTANT_ENABLED ? (
          <>
            <ListRow label="Money agent" onPress={() => router.push('/agent')} />
            <ListRow label="Is this a scam?" onPress={() => router.push('/scam-check')} />
          </>
        ) : null}
        {OFFLINE_ENABLED ? (
          <ListRow label="Offline payments" onPress={() => router.push('/offline')} />
        ) : null}
        {DOLLARS_ENABLED ? (
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
        ) : null}
        <ListRow label="Invite friends" onPress={invite} />
        <ListRow label="Help and support" onPress={() => router.push('/help')} />
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
