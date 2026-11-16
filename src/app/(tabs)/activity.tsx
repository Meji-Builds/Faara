import { StyleSheet } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { ActivityList } from '@/components/wallet/ActivityList';
import { useActivity } from '@/features/account';

/** Every payment sent and received, newest first. */
export default function ActivityScreen() {
  const activity = useActivity(100);
  return (
    <Screen edges={['top']}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Activity
      </AppText>
      <ActivityList entries={activity} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8, marginBottom: 12 },
});
