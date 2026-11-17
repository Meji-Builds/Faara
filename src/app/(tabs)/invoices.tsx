import { FileText } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Placeholder until payment requests are designed. */
export default function InvoicesScreen() {
  const { colors } = useTheme();
  return (
    <Screen edges={['top']}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Invoices
      </AppText>
      <EmptyState
        icon={<FileText size={30} color={colors.accentText} strokeWidth={1.75} />}
        title="Invoices are coming"
        message="Soon you’ll be able to send a payment request to anyone and see who has paid, right here."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8 },
});
