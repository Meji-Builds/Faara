import { relativeDay } from '../format';

describe('activity helpers', () => {
  const now = new Date(2026, 10, 16, 15, 0);

  it('labels days relative to today', () => {
    expect(relativeDay(new Date(2026, 10, 16, 1, 0).getTime(), now)).toBe('Today');
    expect(relativeDay(new Date(2026, 10, 15, 23, 0).getTime(), now)).toBe('Yesterday');
    expect(relativeDay(new Date(2026, 10, 13, 12, 0).getTime(), now)).toMatch(/^[A-Z][a-z]{2}$/);
    expect(relativeDay(new Date(2026, 9, 2, 12, 0).getTime(), now)).toMatch(/2 Oct/);
  });
});
