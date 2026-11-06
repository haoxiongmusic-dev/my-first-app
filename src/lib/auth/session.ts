// Sessions: after a good login the browser keeps a cookie "username.expiry.signature". The
// signature (HMAC-SHA256 with SESSION_SECRET) proves the server issued it, so there is no
// session list to store and a restart logs nobody out.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mv_session";
export const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A session cookie value for this user, valid for 7 days from now. */
export function signSession(user: string, secret: string, now: number = Date.now()): string {
  const payload = `${user}.${now + SESSION_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The signed-in user, or null for a missing, tampered, foreign or expired cookie. */
export function readSession(
  cookie: string | undefined,
  secret: string,
  now: number = Date.now(),
): string | null {
  if (!cookie) return null;
  const sigAt = cookie.lastIndexOf(".");
  const expiryAt = cookie.lastIndexOf(".", sigAt - 1);
  if (sigAt <= 0 || expiryAt <= 0) return null;
  const payload = cookie.slice(0, sigAt);
  const given = Buffer.from(cookie.slice(sigAt + 1), "base64url");
  const expected = Buffer.from(sign(payload, secret), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const expiry = Number(cookie.slice(expiryAt + 1, sigAt));
  if (!Number.isFinite(expiry) || now > expiry) return null;
  return cookie.slice(0, expiryAt);
}

/** Cookie settings: not readable by page scripts, sent on normal links, HTTPS-only when served so. */
export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MS / 1000,
  };
}
