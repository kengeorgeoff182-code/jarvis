import type { FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@jarvis/shared';
import { AppError } from './errors';

function serialize(error: AppError): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.exposeDetails && error.details !== undefined ? { details: error.details } : {}),
    },
  };
}

interface ValidationIssue {
  instancePath: string;
  message: string;
}

/** Fastify attaches `validation` to errors raised by schema validation. */
function isSchemaValidationError(error: unknown): error is { validation: ValidationIssue[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    Array.isArray(error.validation) &&
    error.validation.length > 0
  );
}

/**
 * Single place where thrown errors become HTTP responses. Order matters:
 * 1. AppError (our taxonomy)  → mapped status + envelope
 * 2. Fastify schema validation → 400 VALIDATION_ERROR envelope
 * 3. Anything else            → logged with full context, generic 500 envelope
 */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, 'Request failed');
      }
      return reply.status(error.statusCode).send(serialize(error));
    }

    if (isSchemaValidationError(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation.map((issue) => ({
            path: issue.instancePath,
            message: issue.message,
          })),
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: 'UNEXPECTED_ERROR', message: 'Internal server error' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
