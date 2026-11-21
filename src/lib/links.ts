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
