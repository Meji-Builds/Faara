import { Pressable, StyleSheet, View } from 'react-native';

import { CATEGORY_LABELS, type SupportTicket, type TicketStatus } from '@shared/support';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Waiting for Faara',
  answered: 'Faara replied',
  closed: 'Closed',
};

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** One support ticket in a list. `showUser` for the team's queue. */
export function TicketRow({
  ticket,
  onPress,
  showUser = false,
}: {
  ticket: SupportTicket;
  onPress: () => void;
  showUser?: boolean;
}) {
  const { colors } = useTheme();
  const tone =
    ticket.status === 'open' ? 'gold' : ticket.status === 'answered' ? 'accentText' : 'textMuted';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderColor: colors.border }]}
    >
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {ticket.subject}
        </AppText>
        <AppText variant="label" color="textMuted" numberOfLines={1}>
          {showUser ? `${ticket.user.fullName} · ` : ''}
          {CATEGORY_LABELS[ticket.category]} · {when(ticket.updatedAt)}
        </AppText>
      </View>
      <AppText variant="label" color={tone}>
        {showUser && ticket.status === 'open' ? 'Needs reply' : TICKET_STATUS_LABEL[ticket.status]}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
