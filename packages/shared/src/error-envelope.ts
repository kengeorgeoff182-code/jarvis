import { z } from 'zod';

/**
 * Canonical error envelope. Every non-2xx API response body has exactly this
 * shape; see docs/conventions.md#error-handling.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
