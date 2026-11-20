import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SPEECH_LOCALES, type AssistantLanguage } from '@shared/ai';

/**
 * Speech to text through the phone's own recognizer (Google on Android, the browser on the
 * web). The transcript is only text; what to do with it is decided by the assistant and
 * approved by the person.
 */
export function useSpeech(onDone?: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const heard = useRef('');
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const text = heard.current.trim();
    heard.current = '';
    if (text) onDoneRef.current?.(text);
  });
  useSpeechRecognitionEvent('result', (event) => {
    heard.current = event.results[0]?.transcript ?? '';
    setTranscript(heard.current);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    setError(
      event.error === 'language-not-supported'
        ? 'This phone can’t hear that language yet. Try English or Pidgin, or type it.'
        : event.error === 'not-allowed'
          ? 'Faara can’t use the microphone. Allow it in settings, or type instead.'
          : event.error === 'network'
            ? 'Listening needs a connection on this phone. Type instead.'
            : 'I didn’t catch that. Try again or type it.',
    );
  });

  const start = useCallback(async (language: AssistantLanguage) => {
    setError(null);
    setTranscript('');
    heard.current = '';
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Faara can’t use the microphone. Allow it in settings, or type instead.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: SPEECH_LOCALES[language],
        interimResults: true,
        continuous: false,
      });
    } catch {
      setError('Listening isn’t available on this device. Type instead.');
    }
  }, []);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { listening, transcript, setTranscript, error, start, stop };
}
