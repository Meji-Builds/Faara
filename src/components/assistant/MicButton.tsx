import { Mic, Square } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { palette, useTheme } from '@/theme';

interface MicButtonProps {
  listening: boolean;
  onPress: () => void;
  label?: string;
}

/** The big round button to start and stop listening. */
export function MicButton({ listening, onPress, label }: MicButtonProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop listening' : 'Speak'}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor: listening ? colors.gold : colors.accent,
            shadowColor: listening ? colors.gold : colors.accent,
          },
        ]}
      >
        {listening ? (
          <Square size={28} color={palette.nearBlack} fill={palette.nearBlack} />
        ) : (
          <Mic size={34} color={palette.nearBlack} strokeWidth={1.75} />
        )}
      </Pressable>
      <AppText variant="label" color="textMuted" align="center">
        {listening ? 'Listening… tap to stop' : (label ?? 'Tap and speak')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  button: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
