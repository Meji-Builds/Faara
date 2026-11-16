import { FileText } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Placeholder until invoice links are designed. */
export default function InvoicesScreen() {
  const { colors } = useTheme();
  return (
    <Screen edges={['top']}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Invoices
      </AppText>
      <EmptyState
        icon={<FileText size={30} color={colors.accentText} strokeWidth={1.75} />}
        title="No invoices yet"
        message="Create a payment link and share it with clients. They can pay you in USDC from anywhere."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 8 },
});
