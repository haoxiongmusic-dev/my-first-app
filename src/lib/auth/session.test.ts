// Sessions: a signed cookie, valid for 7 days, no server-side store.
import { describe, expect, it } from "vitest";
import { cookieOptions, readSession, SESSION_COOKIE, signSession } from "@/lib/auth/session";

const secret = "s".repeat(40);
const now = Date.UTC(2026, 10, 6);
const DAY = 24 * 3600 * 1000;

describe("sessions", () => {
  it("a signed session reads back as its user until it expires", () => {
    const cookie = signSession("ana", secret, now);
    expect(readSession(cookie, secret, now)).toBe("ana");
    expect(readSession(cookie, secret, now + 7 * DAY)).toBe("ana");
    expect(readSession(cookie, secret, now + 7 * DAY + 1)).toBeNull();
  });

  it("rejects tampered, foreign or malformed cookies", () => {
    const cookie = signSession("ana", secret, now);
    const [, expiry, sig] = cookie.split(".");
    expect(readSession(`bob.${expiry}.${sig}`, secret, now)).toBeNull();
    expect(readSession(`ana.${Number(expiry) + 1000}.${sig}`, secret, now)).toBeNull();
    expect(readSession(cookie.slice(0, -2) + "xx", secret, now)).toBeNull();
    expect(readSession(cookie, "t".repeat(40), now)).toBeNull();
    expect(readSession(undefined, secret, now)).toBeNull();
    expect(readSession("nonsense", secret, now)).toBeNull();
  });

  it("cookie settings: HttpOnly, Lax, 7 days, Secure only over HTTPS", () => {
    expect(SESSION_COOKIE).toBe("mv_session");
    expect(cookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
    expect(cookieOptions(false).secure).toBe(false);
  });
});
