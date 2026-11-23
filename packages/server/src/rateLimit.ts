/** Fixed-window, in-memory rate limiter. One process, ≤50 users: no need for anything fancier. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records a hit; returns false when the key is over its limit for the current window. */
  hit(key: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      if (this.windows.size > 10_000) this.prune(t, windowMs);
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  }

  private prune(t: number, windowMs: number): void {
    for (const [key, w] of this.windows) if (t - w.start >= windowMs) this.windows.delete(key);
  }
}

/** SPEC §6.2. [limit, window ms]. */
export const RATE_LIMITS = {
  'messages:send': [10, 10_000],
  typing: [1, 2_000],
  'rooms:create': [5, 60 * 60_000],
  upload: [30, 10 * 60_000],
  default: [60, 10_000],
} as const satisfies Record<string, readonly [number, number]>;
