/**
 * Reads a Nigerian mobile number in any common form and returns its 10 national digits
 * (no leading 0 and no country code), or null if it isn't a valid mobile number.
 * "0811 461 4728", "+234 811 461 4728", "8114614728" all give "8114614728".
 * This is also a person's Faara number.
 */
export function nationalPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^[789]\d{9}$/.test(digits) ? digits : null;
}

/** The E.164 form stored on profiles, e.g. "+2348114614728". */
export function toE164(national: string): string {
  return `+234${national}`;
}
