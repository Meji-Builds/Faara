import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { ASSISTANT_LANGUAGES, type AssistantLanguage } from '@shared/ai';

const KEY = 'faara.assistantLanguage.v1';

/** The language the person talks to Faara in, remembered on the phone. */
export function useAssistantLanguage(): [AssistantLanguage, (language: AssistantLanguage) => void] {
  const [language, setLanguage] = useState<AssistantLanguage>('en');
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (saved && ASSISTANT_LANGUAGES.includes(saved as AssistantLanguage)) {
          setLanguage(saved as AssistantLanguage);
        }
      })
      .catch(() => undefined);
  }, []);
  const choose = (next: AssistantLanguage) => {
    setLanguage(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  };
  return [language, choose];
}
