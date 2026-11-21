import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AdminUserSummary } from '@shared/admin';

import { AppText, Header, Screen, TextField } from '@/components/ui';
import { searchUsers } from '@/features/admin';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/** Find a person by username, phone number or id. Empty shows the newest sign-ups. */
export default function AdminUsersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [results, setResults] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (text: string) => {
    setResults(null);
    setError(null);
    try {
      setResults((await searchUsers(text.trim())).users);
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t search. Try again.'));
    }
  }, []);

  useEffect(() => {
    // Show the newest sign-ups (or the person linked from a ticket) on arrival.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void search(params.q ?? '');
  }, [search, params.q]);

  return (
    <Screen>
      <Header center={<AppText variant="subheading">Users</AppText>} />
      <View style={styles.body}>
        <TextField
          label="Username, phone or user id"
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. tolu.a or 0803 123 4567"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => search(query)}
        />
        {!query ? (
          <AppText variant="label" color="textMuted">
            Newest sign-ups
          </AppText>
        ) : null}
        {error ? <AppText color="gold">{error}</AppText> : null}
        {results === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {results?.length === 0 ? <AppText color="textMuted">Nobody found.</AppText> : null}
        {results?.map((user) => (
          <Pressable
            key={user.uid}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/admin/user/[uid]', params: { uid: user.uid } })
            }
            style={[styles.row, { borderColor: colors.border }]}
          >
            <AppText variant="bodyStrong">{user.fullName}</AppText>
            <AppText variant="label" color="textMuted">
              @{user.username} · {user.phone}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, marginTop: 16, paddingBottom: 24 },
  row: { gap: 2, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
