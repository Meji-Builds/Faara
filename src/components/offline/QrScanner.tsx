import { CameraView, useCameraPermissions } from 'expo-camera';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { radii, useTheme } from '@/theme';

interface QrScannerProps {
  /** Called with each QR code seen. Return true to accept it and stop scanning. */
  onScan: (data: string) => boolean;
}

/** Shows a message instead of closing the app if the camera fails. */
class CameraBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <View style={styles.message}>
        <AppText color="textMuted" align="center">
          The camera couldn’t start. Close other apps using it and try again.
        </AppText>
      </View>
    ) : (
      this.props.children
    );
  }
}

/** A camera view that reads QR codes. Works with no network. The camera starts on a tap. */
export function QrScanner({ onScan }: QrScannerProps) {
  const [started, setStarted] = useState(false);
  if (!started) {
    return (
      <View style={styles.message}>
        <Button label="Start camera" onPress={() => setStarted(true)} />
      </View>
    );
  }
  return (
    <CameraBoundary>
      <Scanner onScan={onScan} />
    </CameraBoundary>
  );
}

function Scanner({ onScan }: QrScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <AppText color="textMuted" align="center">
          {permission.canAskAgain
            ? 'Allow camera access to scan the other phone.'
            : 'Camera access is off. Turn it on in your phone settings.'}
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
          if (onScanRef.current(data)) done.current = true;
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
