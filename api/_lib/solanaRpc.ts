import { DEFAULT_RPC_URL, type ParsedTransaction } from '../../shared/solana';

const RPC_URL = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
const ATTEMPTS = 6;
const RETRY_MS = 1000;

/**
 * Fetches a confirmed transaction in jsonParsed form. Retries briefly because a transaction
 * the client saw confirmed may not be visible on this RPC node yet.
 */
export async function fetchParsedTransaction(signature: string): Promise<ParsedTransaction | null> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      result?: ParsedTransaction | null;
    } | null;
    if (body?.result) return body.result;
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  return null;
}
