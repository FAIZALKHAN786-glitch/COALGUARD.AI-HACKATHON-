/**
 * Normalises every failure raised by the API layer into a single, predictable
 * shape so that the UI never has to guess what went wrong.
 */

import type { ApiErrorShape } from '@/types';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = 'AppError';
    this.status = shape.status;
    this.code = shape.code;
    this.details = shape.details;
    this.requestId = shape.requestId;
  }

  /**
   * Returns a copy of this error with the fields the server actually supplied.
   * Used by the HTTP adapter to enrich a status-derived error with the error
   * body's machine code, field details and correlation id without mutating the
   * original instance.
   */
  withServerInfo(shape: Partial<Omit<ApiErrorShape, 'status' | 'message'>>): AppError {
    const enriched = new AppError({
      status: this.status,
      message: this.message,
      code: shape.code ?? this.code,
      details: shape.details ?? this.details,
      requestId: shape.requestId ?? this.requestId,
    });
    enriched.name = this.name;
    enriched.stack = this.stack;
    return enriched;
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Unable to reach the server. Check your connection and try again.') {
    super({ status: 0, code: 'network_error', message });
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'The request timed out. Please try again.') {
    super({ status: 408, code: 'request_timeout', message });
    this.name = 'TimeoutError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super({ status: 401, code: 'unauthorized', message });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({ status: 403, code: 'forbidden', message });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested record could not be found.') {
    super({ status: 404, code: 'not_found', message });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The submitted data is invalid.', details?: Record<string, string[]>) {
    super({ status: 422, code: 'validation_error', message, details });
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please wait a moment and try again.') {
    super({ status: 429, code: 'rate_limited', message });
    this.name = 'RateLimitError';
  }
}

export class ServerError extends AppError {
  constructor(message = 'The server could not complete the request.') {
    super({ status: 500, code: 'server_error', message });
    this.name = 'ServerError';
  }
}

/** Maps an HTTP status code to the matching error type. */
export function errorForStatus(status: number, message?: string): AppError {
  switch (status) {
    case 400:
      return new AppError({ status, code: 'bad_request', message: message ?? 'The request was malformed.' });
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new AppError({
        status,
        code: 'conflict',
        message: message ?? 'The record was modified by someone else. Reload and try again.',
      });
    case 422:
      return new ValidationError(message);
    case 429:
      return new RateLimitError(message);
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(message);
    default:
      return new AppError({
        status,
        code: 'unexpected_error',
        message: message ?? 'An unexpected error occurred.',
      });
  }
}

/**
 * Converts anything thrown by the runtime into an `AppError`.
 * Unknown values never leak raw internals to the user interface.
 */
export function normaliseError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new AppError({ status: 0, code: 'aborted', message: 'The request was cancelled.' });
    }
    return new AppError({
      status: 0,
      code: 'unknown_error',
      message: 'Something went wrong while processing the request.',
    });
  }
  return new AppError({
    status: 0,
    code: 'unknown_error',
    message: 'Something went wrong while processing the request.',
  });
}

/** True when the error represents an authentication problem. */
export function isAuthError(error: unknown): boolean {
  const appError = normaliseError(error);
  return appError.status === 401 || appError.status === 403;
}

/** True when retrying the same request could plausibly succeed. */
export function isRetryable(error: unknown): boolean {
  const appError = normaliseError(error);
  if (appError.status === 0) return true;
  return appError.status === 408 || appError.status === 429 || appError.status >= 500;
}

/**
 * The first message recorded by the server for a given form field, if any.
 * Used to place `ValidationError.details` entries next to the right control
 * instead of only showing a summary toast.
 */
export function fieldError(error: unknown, field: string): string | undefined {
  const appError = normaliseError(error);
  return appError.details?.[field]?.[0];
}

/**
 * Applies server-side field errors to a react-hook-form instance so the user
 * sees them on the offending control.
 */
export function applyServerFieldErrors<T extends Record<string, unknown>>(
  error: unknown,
  setError: (name: never, value: { type: string; message: string }) => void,
): void {
  const appError = normaliseError(error);
  if (!appError.details) return;
  for (const [name, messages] of Object.entries(appError.details)) {
    const message = messages[0];
    if (message) setError(name as never, { type: 'server', message });
  }
}
