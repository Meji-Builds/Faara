/** Where Faara lives on the web. Pay links open here, or in the app when it is installed. */
export const WEB_URL = 'https://faara.mejibuilds.com';

/** The link inside someone's Faara code: opens Send, already addressed to them. */
export function payLink(username: string): string {
  return `${WEB_URL}/pay/${username}`;
}

/** The link to a payment request: opens it, ready to pay. */
export function requestLink(id: string): string {
  return `${WEB_URL}/r/${id}`;
}

/** A Faara link read from a QR code: pay someone, or open a payment request. */
export type FaaraLink = { kind: 'pay'; username: string } | { kind: 'request'; id: string };

/**
 * Reads a Faara pay link or request link (from a shop sticker or someone's Faara code).
 * Anything else, including links to other sites, is null.
 */
export function parseFaaraLink(data: string): FaaraLink | null {
  let url: URL;
  try {
    url = new URL(data.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== new URL(WEB_URL).hostname || !/^https?:$/.test(url.protocol)) return null;
  const pay = /^\/pay\/@?([a-z0-9._]{3,20})\/?$/i.exec(url.pathname);
  if (pay?.[1]) return { kind: 'pay', username: pay[1].toLowerCase() };
  const request = /^\/r\/([A-Za-z0-9_-]{4,64})\/?$/.exec(url.pathname);
  if (request?.[1]) return { kind: 'request', id: request[1] };
  return null;
}
