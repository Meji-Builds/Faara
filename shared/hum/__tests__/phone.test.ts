import { nationalPhone, parseLookupUser, toE164, ValidationError } from '..';

describe('Faara numbers', () => {
  it('reads a phone number written any common way', () => {
    for (const form of [
      '08114614728',
      '8114614728',
      '+234 811 461 4728',
      '234-811-461-4728',
      '0811 461 4728',
    ]) {
      expect(nationalPhone(form)).toBe('8114614728');
    }
  });

  it('rejects things that are not Nigerian mobile numbers', () => {
    for (const bad of ['', '12345', '0611 461 4728', '+1 555 123 4567', 'abc']) {
      expect(nationalPhone(bad)).toBeNull();
    }
  });

  it('turns a lookup by phone into E.164', () => {
    expect(toE164('8114614728')).toBe('+2348114614728');
    expect(parseLookupUser({ phone: '0811 461 4728' })).toEqual({ phone: '+2348114614728' });
    expect(parseLookupUser({ username: '@Tolu.A' })).toEqual({ username: 'tolu.a' });
    expect(() => parseLookupUser({ phone: '123' })).toThrow(ValidationError);
  });
});
