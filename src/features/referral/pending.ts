/**
 * Who the person was about to pay when they opened a pay link before having an account.
 * Kept in memory: sign-up happens in the same session as opening the link.
 */
let pending: string | null = null;

export function rememberPendingRecipient(username: string): void {
  pending = username;
}

export function peekPendingRecipient(): string | null {
  return pending;
}

/** Returns the remembered recipient once, then forgets it. */
export function takePendingRecipient(): string | null {
  const value = pending;
  pending = null;
  return value;
}
