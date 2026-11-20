import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ASSISTANT_LANGUAGES, LANGUAGE_NAMES, type AssistantLanguage } from '@shared/ai';

import { AppText } from '@/components/ui';
import { radii, useTheme } from '@/theme';

interface LanguagePickerProps {
  value: AssistantLanguage;
  onChange: (language: AssistantLanguage) => void;
}

/** Choose the language to speak and be answered in. */
export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {ASSISTANT_LANGUAGES.map((language) => {
        const selected = language === value;
        return (
          <Pressable
            key={language}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(language)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            <AppText variant="label" color={selected ? 'onAccent' : 'text'}>
              {LANGUAGE_NAMES[language]}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
