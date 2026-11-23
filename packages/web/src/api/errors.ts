import type { ErrorCode } from '@pausa/shared';

export type ClientErrorCode = ErrorCode | 'TIMEOUT' | 'OFFLINE';

/** A failed request with a code the UI translates through t(`errors.${code}`). */
export class RequestError extends Error {
  constructor(
    public readonly code: ClientErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RequestError';
  }
}

export function errorCode(err: unknown): ClientErrorCode {
  return err instanceof RequestError ? err.code : 'INTERNAL';
}
