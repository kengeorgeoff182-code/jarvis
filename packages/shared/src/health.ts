import { z } from 'zod';

/**
 * Health-check payload returned by the API.
 *
 * This is the canonical cross-boundary contract: the API validates its
 * outbound payload against this schema and the web client parses inbound
 * payloads with it, so the two sides cannot drift silently.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('jarvis-api'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
