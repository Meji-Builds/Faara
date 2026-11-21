import { parseVendorApplication, parseVendorReview } from '..';

const good = {
  businessName: '  Mama Tolu   Foods ',
  category: 'Food and drinks',
  location: 'Beside the main gate, OOU',
  description: 'Rice, beans and swallow for students.',
  nin: '123 4567 8901',
  cacNumber: 'bn 1234567',
  agreedToTerms: true,
};

describe('vendor application validation', () => {
  it('accepts a complete application and tidies it', () => {
    expect(parseVendorApplication(good)).toMatchObject({
      businessName: 'Mama Tolu Foods',
      nin: '12345678901',
      cacNumber: 'BN 1234567',
    });
    expect(parseVendorApplication({ ...good, cacNumber: '' }).cacNumber).toBe('');
  });

  it('rejects anything missing or wrong', () => {
    for (const bad of [
      { ...good, agreedToTerms: false },
      { ...good, nin: '1234' },
      { ...good, category: 'Guns' },
      { ...good, businessName: 'A' },
      { ...good, description: 'short' },
      { ...good, cacNumber: 'not a number' },
    ]) {
      expect(() => parseVendorApplication(bad)).toThrow();
    }
  });

  it('needs a reason to reject', () => {
    expect(() => parseVendorReview({ uid: 'abcdef12', approve: false, reason: '' })).toThrow();
    expect(parseVendorReview({ uid: 'abcdef12', approve: true })).toEqual({
      uid: 'abcdef12',
      approve: true,
      reason: '',
    });
  });
});
