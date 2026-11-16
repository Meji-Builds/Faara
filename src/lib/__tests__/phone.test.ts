import {
  formatE164,
  formatPhoneInput,
  isCompletePhoneNumber,
  maskPhone,
  nationalNumber,
  normalizePhoneInput,
} from '../phone';

describe('phone input', () => {
  it.each([
    ['0811 461 4728', '08114614728'],
    ['811-461-4728', '8114614728'],
    ['+234 811 461 4728', '8114614728'],
    ['2348114614728', '8114614728'],
    ['(0811) 461-4728 ext', '08114614728'],
  ])('normalises pasted %s without losing digits', (input, expected) => {
    expect(normalizePhoneInput(input)).toBe(expected);
    expect(nationalNumber(normalizePhoneInput(input))).toBe('8114614728');
  });

  it('keeps a leading zero while typing', () => {
    expect(normalizePhoneInput('0')).toBe('0');
    expect(normalizePhoneInput('081')).toBe('081');
  });

  it('caps length at 10 digits, or 11 with a trunk zero', () => {
    expect(normalizePhoneInput('81146147289')).toBe('8114614728');
    expect(normalizePhoneInput('081146147289')).toBe('08114614728');
  });

  it('validates complete Nigerian mobile numbers', () => {
    expect(isCompletePhoneNumber('08114614728')).toBe(true);
    expect(isCompletePhoneNumber('8114614728')).toBe(true);
    expect(isCompletePhoneNumber('811461472')).toBe(false);
    expect(isCompletePhoneNumber('5114614728')).toBe(false);
  });

  it('formats and masks for display', () => {
    expect(formatPhoneInput('08114614728')).toBe('0811 461 4728');
    expect(formatPhoneInput('8114614728')).toBe('811 461 4728');
    expect(formatPhoneInput('081')).toBe('081');
    expect(maskPhone('08114614728')).toBe('+234 811 ••• 4728');
    expect(formatE164('+2348114614728')).toBe('+234 811 461 4728');
    expect(formatE164(null)).toBe('');
  });
});
