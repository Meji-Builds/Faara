/**
 * Webacy (DD.xyz) wallet risk, called server-side so the API key never ships in the app.
 * Configure WEBACY_API_KEY (and optionally WEBACY_CHAIN, default "sol") in Vercel.
 *
 * Parsing is defensive: Webacy's docs show `overallRisk` both at the top level and under
 * `risk`, so both are accepted. Any failure returns null and the badge says "not checked".
 */
const BASE_URL = 'https://api.webacy.com';
const TIMEOUT_MS = 3500;

export interface WalletRisk {
  score: number;
  topIssue: string | null;
}

function toTitle(text: string): string {
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extracts the score and the most notable issue name from a Webacy response body. */
export function parseWebacyResponse(body: unknown): WalletRisk | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const nested = (record.risk ?? null) as Record<string, unknown> | null;
  const rawScore = record.overallRisk ?? nested?.overallRisk;
  const score =
    typeof rawScore === 'number' ? rawScore : typeof rawScore === 'string' ? Number(rawScore) : NaN;
  if (!Number.isFinite(score)) return null;

  const issues = (record.issues ?? nested?.issues) as unknown;
  let topIssue: string | null = null;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      const tags = (issue as { tags?: unknown })?.tags;
      const first = Array.isArray(tags)
        ? (tags[0] as { name?: unknown; key?: unknown } | undefined)
        : undefined;
      const name = first?.name ?? first?.key;
      if (typeof name === 'string' && name) {
        topIssue = toTitle(name);
        break;
      }
    }
  }
  return { score: Math.max(0, Math.min(100, score)), topIssue };
}

export async function fetchWalletRisk(address: string): Promise<WalletRisk | null> {
  const apiKey = process.env.WEBACY_API_KEY;
  if (!apiKey) return null;
  const chain = process.env.WEBACY_CHAIN ?? 'sol';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${BASE_URL}/addresses/${encodeURIComponent(address)}?chain=${encodeURIComponent(chain)}`,
      {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    return parseWebacyResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
