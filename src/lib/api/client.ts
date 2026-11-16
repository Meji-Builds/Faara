import { Platform } from 'react-native';

import type { ApiErrorBody, ApiErrorCode } from '@shared/hum';

import { auth } from '@/lib/firebase';

/**
 * Base URL for the Faara API (Vercel functions under /api).
 * On web the app is served from the same deployment, so relative URLs work on every
 * preview domain. Native builds (and local web dev) use EXPO_PUBLIC_API_URL or production.
 */
const PRODUCTION_URL = 'https://faara-tau.vercel.app';
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : PRODUCTION_URL);

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** POSTs JSON to the API as the signed-in user. */
export async function postJson<Res>(path: string, body: unknown): Promise<Res> {
  const user = auth.currentUser;
  if (!user) throw new ApiRequestError('unauthenticated', 'Sign in to continue.');
  const idToken = await user.getIdToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiRequestError('network', 'No connection. Check your internet and try again.');
  } finally {
    clearTimeout(timer);
  }

  const payload: unknown = await response.json().catch(() => null);
  const error = (payload as Partial<ApiErrorBody> | null)?.error;
  if (!response.ok || payload === null) {
    if (error?.message) throw new ApiRequestError(error.code ?? 'internal', error.message);
    // Not one of our JSON errors: the server function crashed or isn't deployed.
    throw new ApiRequestError(
      'internal',
      `Faara’s server isn’t responding properly (HTTP ${response.status}). Try again in a minute.`,
    );
  }
  return payload as Res;
}

/** Message to show for any error from an API call. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Something went wrong. Try again.';
}
