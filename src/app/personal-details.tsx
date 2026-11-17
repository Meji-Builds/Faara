import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Card, Header, ListRow, Screen } from '@/components/ui';
import { useProfile } from '@/features/auth';
import { initials } from '@/lib/money';
import { faaraNumber, formatE164, normalizePhoneInput } from '@/lib/phone';

/** Who you are on Faara, as other people see you. */
export default function PersonalDetailsScreen() {
  const profile = useProfile();
  const [copied, setCopied] = useState<'username' | 'number' | null>(null);

  const copy = async (text: string, what: 'username' | 'number') => {
    await Clipboard.setStringAsync(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  const copyUsername = () => copy(`@${profile.username}`, 'username');
  const copyNumber = () => copy(faaraNumber(profile.phone), 'number');

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Personal details</AppText>} />
      <View style={styles.identity}>
        <Avatar size={88} initials={initials(profile.fullName)} />
        <AppText variant="heading">{profile.fullName}</AppText>
        <AppText color="textMuted">@{profile.username}</AppText>
      </View>
      <Card divided>
        <ListRow label="Full name" value={profile.fullName} showChevron={false} />
        <ListRow
          label="Username"
          value={copied === 'username' ? 'Copied' : `@${profile.username}`}
          onPress={copyUsername}
          showChevron={false}
        />
        <ListRow
          label="Faara number"
          value={copied === 'number' ? 'Copied' : faaraNumber(profile.phone)}
          onPress={copyNumber}
          showChevron={false}
        />
        <ListRow
          label="Phone number"
          value={formatE164(normalizePhoneInput(profile.phone))}
          showChevron={false}
        />
      </Card>
      <AppText variant="caption" color="textMuted" style={styles.note}>
        People find you by your username or Faara number. Tap either to copy. Changing your name,
        username or phone number will come with identity verification.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 6, marginVertical: 24 },
  note: { marginTop: 14, paddingHorizontal: 4 },
});
