/** A Solana wallet app the person connected through Mobile Wallet Adapter. */
export interface ConnectedWallet {
  /** Base58 address. */
  address: string;
  label: string;
  /** Lets Faara ask the same wallet again without a new connect prompt. */
  authToken: string;
}
