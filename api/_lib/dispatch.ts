import { json } from './http';

type Handler = (request: Request) => Promise<Response>;

/**
 * One serverless function can serve a whole family of routes (`/api/hums/create`,
 * `/api/hums/claim`, ...): the last path segment picks the handler. This keeps the number
 * of deployed functions low (the free plan allows 12) without changing any URL.
 */
export function dispatch(handlers: Record<string, Handler>): Handler {
  return async (request) => {
    const action = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    const handler = Object.hasOwn(handlers, action) ? handlers[action] : undefined;
    if (!handler) {
      return json(404, { error: { code: 'not-found', message: 'That endpoint doesn’t exist.' } });
    }
    return handler(request);
  };
}
