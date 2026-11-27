import type { AckError, ErrorCode } from '@pausa/shared';

/** An expected failure with a code the client can translate. Message is for developers/logs. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAckError(err: unknown): AckError {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: 'INTERNAL', message: 'Internal error' };
}
