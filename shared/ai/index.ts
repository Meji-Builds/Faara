import { AssistantValidationError } from './errors';

export { AssistantValidationError };

/**
 * Faara's assistant: payments by voice or text in Nigerian languages, scam checks, and the
 * money agent's plain-language rules. The assistant suggests and fills in; money only ever
 * moves after the person approves with their PIN or fingerprint (or, for the money agent,
 * under a rule they approved).
 */

/** Languages the assistant understands and answers in. */
export const ASSISTANT_LANGUAGES = ['en', 'pcm', 'yo', 'ha', 'ig'] as const;
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<AssistantLanguage, string> = {
  en: 'English',
  pcm: 'Pidgin',
  yo: 'Yorùbá',
  ha: 'Hausa',
  ig: 'Igbo',
};

/** Speech recognition locales for each language (Nigerian Pidgin is heard as Nigerian English). */
export const SPEECH_LOCALES: Record<AssistantLanguage, string> = {
  en: 'en-NG',
  pcm: 'en-NG',
  yo: 'yo-NG',
  ha: 'ha-NG',
  ig: 'ig-NG',
};

export type AssistantAction =
  'send' | 'buy_usdc' | 'sell_usdc' | 'savings_rule' | 'balance' | 'scam_check' | 'unclear';

export interface AssistantIntent {
  action: AssistantAction;
  /** Who to pay, when the assistant could match someone the person knows. */
  recipient: { username: string; fullName: string } | null;
  /** Naira amount, when one was given. */
  amountNaira: number | null;
  /** USDC amount, when one was given. */
  amountUsdc: number | null;
  note: string;
  /** What the assistant says back, in the person's language. */
  reply: string;
  language: AssistantLanguage;
}

export type RiskLevel = 'ok' | 'caution' | 'warning';

/** The scam guard's view of a payment about to be made. */
export interface PaymentCheck {
  level: RiskLevel;
  /** Short heading, e.g. "First payment to this person". Empty when level is ok. */
  title: string;
  /** One or two plain sentences. Empty when level is ok. */
  reason: string;
}

export type ScamVerdict = 'likely_scam' | 'suspicious' | 'looks_safe';

export interface ScamCheck {
  verdict: ScamVerdict;
  /** The scam's common name, e.g. "Fake bank alert". Empty when it looks safe. */
  pattern: string;
  explanation: string;
  advice: string[];
}

export const MAX_INSTRUCTION_LENGTH = 500;
export const MAX_SCAM_TEXT_LENGTH = 4_000;
/** About 2.2 MB of image once decoded (requests to the server are capped at 4.5 MB). */
export const MAX_IMAGE_BASE64_LENGTH = 3_000_000;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

function language(value: unknown): AssistantLanguage {
  return ASSISTANT_LANGUAGES.includes(value as AssistantLanguage)
    ? (value as AssistantLanguage)
    : 'en';
}

export function parseIntentRequest(body: unknown): { text: string; language: AssistantLanguage } {
  const data = record(body);
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new AssistantValidationError('Say or type what you want to do.');
  if (text.length > MAX_INSTRUCTION_LENGTH) {
    throw new AssistantValidationError('That’s too long. Keep it to one instruction.');
  }
  return { text, language: language(data.language) };
}

export function parsePaymentCheckRequest(body: unknown): {
  username: string;
  amountKobo: number;
  note: string;
} {
  const data = record(body);
  const { username, amountKobo, note } = data;
  if (typeof username !== 'string' || !/^[a-z0-9._]{3,30}$/.test(username)) {
    throw new AssistantValidationError('That username isn’t valid.');
  }
  if (typeof amountKobo !== 'number' || !Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    throw new AssistantValidationError('That amount isn’t valid.');
  }
  return {
    username,
    amountKobo,
    note: typeof note === 'string' ? note.slice(0, 200) : '',
  };
}

export function parseScamCheckRequest(body: unknown): {
  text: string;
  image: { mediaType: ImageType; data: string } | null;
  language: AssistantLanguage;
} {
  const data = record(body);
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (text.length > MAX_SCAM_TEXT_LENGTH) {
    throw new AssistantValidationError('That message is too long. Paste the main part.');
  }
  let image: { mediaType: ImageType; data: string } | null = null;
  const raw = record(data.image);
  if (data.image !== undefined && data.image !== null) {
    if (!IMAGE_TYPES.includes(raw.mediaType as ImageType)) {
      throw new AssistantValidationError('Use a JPEG, PNG or WebP screenshot.');
    }
    if (
      typeof raw.data !== 'string' ||
      raw.data.length === 0 ||
      raw.data.length > MAX_IMAGE_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/]+=*$/.test(raw.data)
    ) {
      throw new AssistantValidationError('That screenshot is too large or unreadable.');
    }
    image = { mediaType: raw.mediaType as ImageType, data: raw.data };
  }
  if (!text && !image) {
    throw new AssistantValidationError('Paste the message or add a screenshot to check.');
  }
  return { text, image, language: language(data.language) };
}
export * from './agent';
