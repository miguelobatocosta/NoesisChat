import { z } from 'zod';

/** GET /health. Deliberately minimal: no version or name for scanners to fingerprint (SPEC §6.1). */
export const HealthResponse = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Uniform error body for HTTP routes; Socket.IO acks reuse the same shape (SPEC §6.2). */
export const ErrorBody = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
