/** Display helpers for account screens (no platform dependencies). */

/** "Today", "Yesterday", weekday within a week, else "12 Nov". */
export function relativeDay(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Deterministic 10-digit mock account number for display until the BaaS issues real ones. */
export function mockAccountNumber(uid: string): string {
  let hash = 2166136261;
  for (const char of uid) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const digits = String(hash).padStart(10, '0').slice(-10);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
