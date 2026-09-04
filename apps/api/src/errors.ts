/**
 * Typed error taxonomy. Services and routes throw AppError subclasses; a
 * single central handler (error-handler.ts) maps them to HTTP responses.
 * Never send a raw Error across the process boundary — see
 * docs/conventions.md#error-handling.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'UNEXPECTED_ERROR';

interface AppErrorOptions {
  /** Optional structured detail. Only sent to clients when expose is true. */
  details?: unknown;
  /** Whether `details` is safe to expose to API clients. */
  exposeDetails?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly exposeDetails: boolean;

  constructor(code: ErrorCode, statusCode: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.exposeDetails = options.exposeDetails ?? false;
  }
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError('VALIDATION_ERROR', 400, message, {
    details,
    exposeDetails: details !== undefined,
  });
}

export function notFoundError(message: string): AppError {
  return new AppError('NOT_FOUND', 404, message);
}

export function unauthorizedError(message = 'Authentication required'): AppError {
  return new AppError('UNAUTHORIZED', 401, message);
}

export function forbiddenError(message = 'You do not have permission to perform this action'): AppError {
  return new AppError('FORBIDDEN', 403, message);
}

export function conflictError(message: string): AppError {
  return new AppError('CONFLICT', 409, message);
}

export function externalServiceError(message: string, cause?: unknown): AppError {
  return new AppError('EXTERNAL_SERVICE_ERROR', 502, message, { cause });
}

export function unexpectedError(message = 'Internal server error', cause?: unknown): AppError {
  return new AppError('UNEXPECTED_ERROR', 500, message, { cause });
}
