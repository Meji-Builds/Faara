import { BellRing } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, EmptyState, Header, Screen } from '@/components/ui';
import { ActivityList } from '@/components/wallet/ActivityList';
import { useActivity } from '@/features/account';
import { useNotifications } from '@/features/notifications';
import { useTheme } from '@/theme';

/** Money you've received, newest first. Opening this clears the bell's unread dot. */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const activity = useActivity(100);
  const { markAllRead } = useNotifications();
  const received = activity?.filter((entry) => entry.direction === 'in') ?? null;

  useEffect(() => {
    markAllRead();
  }, [markAllRead, received?.length]);

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Notifications</AppText>} />
      {received !== null && received.length === 0 ? (
        <EmptyState
          icon={<BellRing size={30} color={colors.accentText} strokeWidth={1.75} />}
          title="Nothing yet"
          message="When someone pays you or a top-up arrives, it shows up here."
        />
      ) : (
        <AppText variant="overline" color="textMuted" style={styles.heading}>
          MONEY RECEIVED
        </AppText>
      )}
      {received === null || received.length > 0 ? <ActivityList entries={received} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 20, marginBottom: 4 },
});
