import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AdminLogEntry } from '@shared/admin';

import { AppText, Header, Screen } from '@/components/ui';
import { adminLog } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Every action Faara's team has taken, newest first. */
export default function AdminLogScreen() {
  const { colors } = useTheme();
  const [log, setLog] = useState<AdminLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      adminLog()
        .then((result) => active && setLog(result.log))
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load the log. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Admin log</AppText>} />
      <View style={styles.body}>
        {error ? <AppText color="gold">{error}</AppText> : null}
        {log === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {log?.length === 0 ? <AppText color="textMuted">Nothing yet.</AppText> : null}
        {log?.map((entry) => (
          <View key={entry.id} style={[styles.row, { borderColor: colors.border }]}>
            <AppText variant="bodyStrong">
              @{entry.admin} · {entry.action}
              {entry.target ? ` · @${entry.target}` : ''}
            </AppText>
            <AppText variant="label" color="textMuted">
              {when(entry.at)}
              {entry.detail ? ` · ${entry.detail}` : ''}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 16, paddingBottom: 24 },
  row: { gap: 2, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
