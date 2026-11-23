import { monotonicFactory } from 'ulid';

/** Monotonic ULIDs: strictly increasing even within one millisecond (SPEC §5). */
const next = monotonicFactory();

export function newId(): string {
  return next();
}
