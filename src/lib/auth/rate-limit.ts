// Slows down password guessing: after too many wrong logins from one address in a while, that
// address has to wait. Kept in memory (one server, a few users).
type Entry = { fails: number[]; blockedUntil: number };

export type RateLimiter = {
  /** May this address try to log in now? */
  check(ip: string, now: number): boolean;
  /** Record a wrong login. */
  fail(ip: string, now: number): void;
  /** A good login clears the address's record. */
  succeed(ip: string): void;
};

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  blockMs: number;
}): RateLimiter {
  const entries = new Map<string, Entry>();
  return {
    check(ip, now) {
      const e = entries.get(ip);
      return !e || e.blockedUntil <= now;
    },
    fail(ip, now) {
      const e = entries.get(ip) ?? { fails: [], blockedUntil: 0 };
      e.fails = e.fails.filter((t) => t > now - opts.windowMs);
      e.fails.push(now);
      if (e.fails.length >= opts.max) {
        e.blockedUntil = now + opts.blockMs;
        e.fails = [];
      }
      entries.set(ip, e);
    },
    succeed(ip) {
      entries.delete(ip);
    },
  };
}
