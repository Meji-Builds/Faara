import { redact } from '../redact';

describe('redact', () => {
  it('keeps amounts and wording, removes identifying details', () => {
    expect(redact('Send Tolu 5k for fabric', ['Tolu Adebayo'])).toBe('Send [NAME] 5k for fabric');
    expect(redact('pay @tolu.a 20,000 abeg')).toBe('pay [USERNAME] 20,000 abeg');
    expect(redact('Call me on 0803 123 4567 or +2348031234567')).toBe(
      'Call me on [NUMBER] or [NUMBER]',
    );
    expect(redact('Acct 0123456789 GTBank')).toBe('Acct [NUMBER] GTBank');
    expect(redact('Your OTP is 482913, don’t share')).toBe('Your OTP is [CODE], don’t share');
    expect(redact('mail ada@example.com')).toBe('mail [EMAIL]');
  });

  it('keeps the site of a link but not its path or query', () => {
    expect(redact('Verify at https://Bank-Verify.xyz/login?id=ada123 now')).toBe(
      'Verify at [LINK bank-verify.xyz] now',
    );
  });

  it('matches names in any case without touching other words', () => {
    expect(redact('give TOLU and tolulope money', ['Tolu'])).toBe('give [NAME] and tolulope money');
    expect(redact('Ọlá sent it', ['Ọlá Bello'])).toBe('[NAME] sent it');
  });
});
