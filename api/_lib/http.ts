import { randomBytes, randomInt } from 'node:crypto';

import { ValidationError, type ApiErrorBody } from '../../shared/hum';

import { ApiError } from './errors';
import { adminDb, firestoreStore, verifyIdToken } from './firebaseAdmin';
import { HumService } from './humService';

let service: HumService | undefined;

function humService(): HumService {
  service ??= new HumService({
    store: firestoreStore(adminDb()),
    now: () => Date.now(),
    randomInt: (n) => randomInt(n),
    newId: () => randomBytes(15).toString('base64url'),
  });
  return service;
}

/**
 * Requests authenticate with a bearer token, not cookies, so any origin may call the
 * API (e.g. the app running on a local dev server).
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

/** CORS preflight handler shared by every route. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(error.status, {
      error: { code: error.code, message: error.message },
    } satisfies ApiErrorBody);
  }
  if (error instanceof ValidationError) {
    return json(400, {
      error: { code: 'invalid-argument', message: error.message },
    } satisfies ApiErrorBody);
  }
  console.error(error);
  return json(500, {
    error: { code: 'internal', message: 'Something went wrong.' },
  } satisfies ApiErrorBody);
}

/**
 * Builds a POST handler: authenticates the Firebase ID token in the Authorization
 * header, validates the JSON body, and runs the action.
 */
export function humRoute<Req, Res>(
  parse: (body: unknown) => Req,
  action: (service: HumService, uid: string, request: Req) => Promise<Res>,
) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const header = request.headers.get('authorization') ?? '';
      const match = /^Bearer (.+)$/.exec(header);
      if (!match) throw new ApiError('unauthenticated', 'Sign in to continue.');
      let uid: string;
      try {
        uid = await verifyIdToken(match[1] as string);
      } catch {
        throw new ApiError('unauthenticated', 'Your session has expired. Sign in again.');
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ValidationError('Request body must be JSON.');
      }
      const result = await action(humService(), uid, parse(body));
      return json(200, result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
