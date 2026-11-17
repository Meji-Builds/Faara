import { FileText, ImageDown } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { downloadReceipt, shareReceiptImage, type ReceiptData } from '@/features/receipts';
import type { ViewRef } from '@/lib/viewRef';
import { useTheme } from '@/theme';

interface ReceiptActionsProps {
  receipt: ReceiptData;
  captureRef: ViewRef;
}

/** Share the receipt as an image, or save it as a PDF. */
export function ReceiptActions({ receipt, captureRef }: ReceiptActionsProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<'image' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'image' | 'pdf') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'image') await shareReceiptImage(receipt, captureRef);
      else await downloadReceipt(receipt);
    } catch {
      setError('Couldn’t create the receipt. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error ? (
        <AppText variant="label" color="gold" align="center">
          {error}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <Button
          label="Image"
          icon={<ImageDown size={20} color={colors.onAccent} strokeWidth={1.75} />}
          loading={busy === 'image'}
          disabled={busy !== null}
          onPress={() => run('image')}
          style={styles.flex}
          accessibilityHint="Shares or saves the receipt as an image"
        />
        <Button
          label="PDF"
          variant="outline"
          icon={<FileText size={20} color={colors.text} strokeWidth={1.75} />}
          loading={busy === 'pdf'}
          disabled={busy !== null}
          onPress={() => run('pdf')}
          style={styles.flex}
          accessibilityHint="Saves the receipt as a PDF"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
