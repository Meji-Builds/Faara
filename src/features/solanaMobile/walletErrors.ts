/** Says why a wallet app couldn't be reached, in words people can act on. */
export function walletErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const text = `${String(code ?? '')} ${error instanceof Error ? error.message : String(error)}`;
  // No wallet app answered Faara's request: none installed, or never opened once.
  if (/WALLET_NOT_FOUND|no installed wallet|not found|websocket/i.test(text)) {
    return 'No Solana wallet app answered. Install Phantom or Solflare, open it once and set it up, then connect.';
  }
  if (/declin|reject|cancel|NOT_SIGNED|AUTHORIZATION_FAILED/i.test(text)) {
    return 'The wallet app said no. Try again and approve it there.';
  }
  if (/cluster|chain|devnet/i.test(text)) {
    return 'Switch your wallet app to the test network (devnet), then connect.';
  }
  if (/timeout|timed out|SESSION_CLOSED|closed/i.test(text)) {
    return 'The wallet app closed before it finished. Keep it open until it returns to Faara.';
  }
  return `The wallet didn’t connect. ${text.trim().slice(0, 120)}`;
}
