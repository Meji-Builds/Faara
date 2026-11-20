/**
 * Removes personal details from text before it is kept as an AI training example. Amounts,
 * languages and the shape of what people say are kept; who they are is not.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const USERNAME = /(^|[^A-Za-z0-9._])@[a-z0-9._]{3,30}/gi;
const URL = /\bhttps?:\/\/([^/\s?#]+)[^\s]*/gi;
/** OTPs, PINs and codes mentioned as such. */
const CODE = /\b(otp|pin|code|token|password)(\s*(?:is|:|=|-)?\s*)\d{4,8}\b/gi;
/** Runs of 7 or more digits (phone, account, card and BVN numbers), with spaces or dashes. */
const LONG_NUMBER = /\+?\d(?:[\s-]?\d){6,}/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param names People's names known in this context (for example the person's contacts);
 *   each word of three letters or more is replaced.
 */
export function redact(text: string, names: readonly string[] = []): string {
  let out = text
    .replace(EMAIL, '[EMAIL]')
    .replace(URL, (_match, host: string) => `[LINK ${host.toLowerCase()}]`)
    .replace(USERNAME, (_match, before: string) => `${before}[USERNAME]`)
    .replace(CODE, (_match, word: string, gap: string) => `${word}${gap}[CODE]`)
    .replace(LONG_NUMBER, '[NUMBER]');
  const words = new Set(
    names.flatMap((name) => name.split(/\s+/)).filter((word) => word.length >= 3),
  );
  for (const word of words) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}])${escapeRegExp(word)}(?![\\p{L}])`, 'giu'),
      '[NAME]',
    );
  }
  return out;
}
