// Login attempts: 10 failures per IP in 10 minutes, then a 10-minute wait.
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/auth/rate-limit";

const MIN = 60_000;

describe("login rate limit", () => {
  it("allows 10 failures, refuses the 11th attempt, and forgives after 10 minutes", () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 10 * MIN, blockMs: 10 * MIN });
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("1.2.3.4", t0 + i)).toBe(true);
      limiter.fail("1.2.3.4", t0 + i);
    }
    expect(limiter.check("1.2.3.4", t0 + 20)).toBe(false);
    expect(limiter.check("5.6.7.8", t0 + 20)).toBe(true); // other people are unaffected
    expect(limiter.check("1.2.3.4", t0 + 9 + 10 * MIN - 1)).toBe(false);
    expect(limiter.check("1.2.3.4", t0 + 9 + 10 * MIN + 1)).toBe(true);
  });

  it("old failures drop out of the window, and a good login resets the count", () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 10 * MIN, blockMs: 10 * MIN });
    for (let i = 0; i < 9; i++) limiter.fail("ip", i);
    limiter.fail("ip", 11 * MIN); // the first nine have expired
    expect(limiter.check("ip", 11 * MIN + 1)).toBe(true);
    for (let i = 0; i < 9; i++) limiter.fail("ip2", i);
    limiter.succeed("ip2");
    limiter.fail("ip2", 10);
    expect(limiter.check("ip2", 11)).toBe(true);
  });
});
