import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { RequestListItem } from '@shared/requests';

import { AppText, Button, EmptyState, Screen, TextTabs } from '@/components/ui';
import { listRequests, naira, STATUS_LABEL } from '@/features/requests';
import { friendlyError } from '@/lib/errors';
import { palette, radii, useTheme } from '@/theme';

type Tab = 'sent' | 'toPay';
const TABS: readonly Tab[] = ['sent', 'toPay'];

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Payment requests: ones you sent, and ones you're asked to pay. */
export default function InvoicesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('sent');
  const [items, setItems] = useState<RequestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listRequests()
        .then((result) => {
          if (!active) return;
          setItems(result.requests);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (active) setError(friendlyError(cause, 'Couldn’t load your invoices. Try again.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const shown = (items ?? []).filter((item) => item.role === tab);

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          Invoices
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New invoice"
          onPress={() => router.push('/request-new')}
          style={[styles.add, { backgroundColor: colors.accent }]}
        >
          <Plus size={22} color={palette.nearBlack} strokeWidth={2} />
        </Pressable>
      </View>

      <TextTabs
        options={TABS}
        value={tab}
        onChange={setTab}
        labels={{ sent: 'Sent', toPay: 'To pay' }}
      />

      {error ? (
        <AppText color="gold" style={styles.gap}>
          {error}
        </AppText>
      ) : items === null ? (
        <ActivityIndicator color={colors.accent} style={styles.gap} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<FileText size={30} color={colors.accentText} strokeWidth={1.75} />}
          title={tab === 'sent' ? 'No invoices yet' : 'Nothing to pay'}
          message={
            tab === 'sent'
              ? 'Ask someone for money, or share a link anyone can pay. You’ll see the moment it’s paid.'
              : 'When someone sends you an invoice, it shows up here.'
          }
          action={
            tab === 'sent' ? (
              <Button label="New invoice" onPress={() => router.push('/request-new')} />
            ) : undefined
          }
        />
      ) : (
        <View style={styles.list}>
          {shown.map((item) => {
            const other = item.role === 'sent' ? (item.paidBy ?? item.from) : item.requester;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/r/[id]', params: { id: item.id } })}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {item.note}
                  </AppText>
                  <AppText variant="label" color="textMuted" numberOfLines={1}>
                    {item.role === 'sent'
                      ? other
                        ? `${item.paidBy ? 'Paid by' : 'To'} ${other.fullName}`
                        : 'Anyone with the link'
                      : `From ${item.requester.fullName}`}
                    {' · '}
                    {when(item.createdAt)}
                  </AppText>
                </View>
                <View style={styles.rowEnd}>
                  <AppText variant="bodyStrong">{naira(item.amountKobo)}</AppText>
                  <AppText
                    variant="label"
                    color={
                      item.status === 'paid'
                        ? 'accentText'
                        : item.status === 'open'
                          ? 'gold'
                          : 'textMuted'
                    }
                  >
                    {STATUS_LABEL[item.status]}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: { marginTop: 24 },
  list: { marginTop: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
});
