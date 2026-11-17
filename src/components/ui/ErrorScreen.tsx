import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ErrorScreenProps {
  onRetry: () => void;
}

/**
 * Shown when a screen fails to load or crashes. Rendered outside the app's providers,
 * so it uses fixed colours and the system font.
 */
export function ErrorScreen({ onRetry }: ErrorScreenProps) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>This page didn’t load</Text>
      <Text style={styles.message}>
        Your connection may have dropped. Check your internet and try again.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    backgroundColor: '#EAF7F2',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0B3D2E', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, color: '#3F5B52', textAlign: 'center', maxWidth: 320 },
  button: {
    marginTop: 12,
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 26,
    backgroundColor: '#0B3D2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
