import type { ApiErrorCode } from '../../shared/hum';

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  'invalid-argument': 400,
  'not-found': 404,
  expired: 410,
  'already-chosen': 409,
  'permission-denied': 403,
  'resource-exhausted': 429,
  'failed-precondition': 412,
  internal: 500,
};

/** An error whose code and message are safe to return to the client. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}
