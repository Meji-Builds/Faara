import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { parseHumQr } from '@shared/hum';

import { AppText, Button } from '@/components/ui';
import { radii, useTheme } from '@/theme';

interface QrScannerProps {
  /** Called once with the hum code from the first valid Faara QR code. */
  onToken: (token: string) => void;
}

/** Camera view that scans a Faara payment QR code. */
export function QrScanner({ onToken }: QrScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <AppText color="textMuted" align="center">
          {permission.canAskAgain
            ? 'Allow camera access to scan the sender’s QR code.'
            : 'Camera access is off. Turn it on in your phone or browser settings.'}
        </AppText>
        {permission.canAskAgain ? (
          <Button label="Allow camera" variant="outline" onPress={requestPermission} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.frame, { borderColor: colors.accent }]}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          const token = parseHumQr(data);
          if (!token) return;
          done.current = true;
          onToken(token);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  camera: { flex: 1 },
  message: { gap: 16, alignItems: 'center', paddingVertical: 24 },
});
