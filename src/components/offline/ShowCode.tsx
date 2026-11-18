import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { palette, radii } from '@/theme';

/** A large, high-contrast QR code for another phone to scan. */
export function ShowCode({ value }: { value: string }) {
  return (
    <View style={styles.frame} accessibilityLabel="Code for the other phone to scan">
      <QRCode
        value={value}
        size={280}
        ecl="L"
        color={palette.deepGreen}
        backgroundColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    padding: 16,
    borderRadius: radii.xl,
    backgroundColor: '#FFFFFF',
  },
});
