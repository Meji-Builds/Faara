/**
 * Nigerian phone number handling. Input is stored as typed digits (so a leading
 * trunk "0" survives while typing) and normalised to the 10-digit national
 * number for validation and submission.
 */

const COUNTRY_CODE = '234';
const NATIONAL_LENGTH = 10;

/**
 * Cleans raw input (typed or pasted) into digits. Accepts "0811 461 4728",
 * "811-461-4728", "+234 811 461 4728" and "2348114614728".
 */
export function normalizePhoneInput(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith(COUNTRY_CODE) && digits.length > NATIONAL_LENGTH) {
    digits = digits.slice(COUNTRY_CODE.length);
  }
  const max = digits.startsWith('0') ? NATIONAL_LENGTH + 1 : NATIONAL_LENGTH;
  return digits.slice(0, max);
}

/** The 10-digit national number, without the trunk "0". */
export function nationalNumber(digits: string): string {
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

/** Nigerian mobile numbers are 10 digits starting with 7, 8 or 9. */
export function isCompletePhoneNumber(digits: string): boolean {
  return /^[789]\d{9}$/.test(nationalNumber(digits));
}

/** Display grouping: "0811 461 4728" with a trunk zero, otherwise "811 461 4728". */
export function formatPhoneInput(digits: string): string {
  const groups = digits.startsWith('0') ? [4, 3, 4] : [3, 3, 4];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    const part = digits.slice(index, index + size);
    if (!part) break;
    parts.push(part);
    index += size;
  }
  return parts.join(' ');
}

/** "+234 811 ••• 4728" */
export function maskPhone(digits: string): string {
  const national = nationalNumber(digits);
  if (national.length < NATIONAL_LENGTH) return `+${COUNTRY_CODE}`;
  return `+${COUNTRY_CODE} ${national.slice(0, 3)} ••• ${national.slice(6)}`;
}

/** "+2348114614728" → "+234 811 461 4728" */
export function formatE164(phone: string | null | undefined): string {
  if (!phone) return '';
  const national = nationalNumber(normalizePhoneInput(phone));
  return national.length === NATIONAL_LENGTH
    ? `+${COUNTRY_CODE} ${formatPhoneInput(national)}`
    : phone;
}
