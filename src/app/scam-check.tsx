import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, ShieldAlert, ShieldCheck, ShieldQuestion, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import {
  IMAGE_TYPES,
  MAX_IMAGE_BASE64_LENGTH,
  type ImageType,
  type ScamCheck,
  type ScamVerdict,
} from '@shared/ai';

import { AiConsentCard, AnswerFeedback, LanguagePicker } from '@/components/assistant';
import { AppText, Button, Card, Header, Screen, TextField } from '@/components/ui';
import { checkForScam, useAiConsent, useAssistantLanguage } from '@/features/assistant';
import { friendlyError } from '@/lib/errors';
import { radii, useTheme } from '@/theme';

interface Picked {
  uri: string;
  mediaType: ImageType;
  data: string;
}

const VERDICT: Record<ScamVerdict, { title: string; Icon: typeof ShieldAlert }> = {
  likely_scam: { title: 'This looks like a scam', Icon: ShieldAlert },
  suspicious: { title: 'Be careful with this', Icon: ShieldQuestion },
  looks_safe: { title: 'Nothing obviously wrong', Icon: ShieldCheck },
};

/** "Is this a scam?": paste a message or add a screenshot, and Faara looks for the signs. */
export default function ScamCheckScreen() {
  const { colors } = useTheme();
  const [language, setLanguage] = useAssistantLanguage();
  const aiConsent = useAiConsent();
  const [text, setText] = useState('');
  const [image, setImage] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScamCheck | null>(null);

  const pick = async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.base64) return;
    const mediaType = (asset.mimeType ?? 'image/jpeg') as ImageType;
    if (!IMAGE_TYPES.includes(mediaType)) {
      setError('Use a JPEG, PNG or WebP screenshot.');
      return;
    }
    if (asset.base64.length > MAX_IMAGE_BASE64_LENGTH) {
      setError('That screenshot is too large. Crop it to the message and try again.');
      return;
    }
    setImage({ uri: asset.uri, mediaType, data: asset.base64 });
    setResult(null);
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await checkForScam(
          text.trim(),
          image ? { mediaType: image.mediaType, data: image.data } : null,
          language,
        ),
      );
    } catch (cause) {
      setError(friendlyError(cause, 'Couldn’t check that just now. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verdict = result ? VERDICT[result.verdict] : null;
  const tone = result?.verdict === 'looks_safe' ? colors.accent : colors.gold;

  return (
    <Screen
      footer={
        <>
          {error ? (
            <AppText variant="label" color="gold" align="center">
              {error}
            </AppText>
          ) : null}
          <Button
            label="Check it"
            disabled={(!text.trim() && !image) || busy}
            loading={busy}
            onPress={check}
          />
          <AppText variant="caption" color="textMuted" align="center">
            Faara never asks for your PIN, OTP or BVN. Anyone who does is not Faara.
          </AppText>
        </>
      }
    >
      <Header center={<AppText variant="subheading">Is this a scam?</AppText>} />
      <View style={styles.body}>
        {aiConsent.consent === null ? (
          <AiConsentCard
            onChoose={(value) => void aiConsent.choose(value).catch(() => undefined)}
          />
        ) : null}
        <LanguagePicker value={language} onChange={setLanguage} />
        <TextField
          label="Paste the message"
          value={text}
          onChangeText={(next) => {
            setText(next);
            setResult(null);
          }}
          placeholder="e.g. a credit alert, a “wrong transfer” message, a job offer…"
          multiline
          numberOfLines={4}
        />

        {image ? (
          <View style={[styles.preview, { borderColor: colors.border }]}>
            <Image source={{ uri: image.uri }} style={styles.image} resizeMode="contain" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove screenshot"
              onPress={() => {
                setImage(null);
                setResult(null);
              }}
              style={[styles.remove, { backgroundColor: colors.surface }]}
            >
              <X size={18} color={colors.text} />
            </Pressable>
          </View>
        ) : (
          <Button
            label="Add a screenshot"
            variant="outline"
            icon={<ImagePlus size={18} color={colors.text} strokeWidth={1.75} />}
            onPress={pick}
          />
        )}

        {result && verdict ? (
          <Card padded style={{ ...styles.result, borderColor: tone }}>
            <View style={styles.verdict}>
              <verdict.Icon size={24} color={tone} strokeWidth={1.75} />
              <AppText variant="subheading" style={{ color: tone }}>
                {verdict.title}
              </AppText>
            </View>
            {result.pattern ? <AppText variant="bodyStrong">{result.pattern}</AppText> : null}
            <AppText color="textMuted">{result.explanation}</AppText>
            {result.advice.map((tip) => (
              <AppText key={tip}>• {tip}</AppText>
            ))}
            {result.exampleId ? <AnswerFeedback exampleId={result.exampleId} /> : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, marginTop: 16, paddingBottom: 24 },
  preview: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  image: { width: '100%', height: 260 },
  remove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: { gap: 8, borderWidth: 1 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
