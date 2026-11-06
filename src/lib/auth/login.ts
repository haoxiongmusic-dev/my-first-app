// The login check behind POST /api/auth/login, kept apart from the route so it can be tested.
import { safeNext, loginEnabled } from "@/lib/auth/gate";
import { DUMMY_HASH, parseAccounts, verifyPassword } from "@/lib/auth/passwords";
import { createRateLimiter, type RateLimiter } from "@/lib/auth/rate-limit";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth/session";

export const WRONG_LOGIN = "Wrong username or password.";
export const TOO_MANY = "Too many attempts: try again in 10 minutes.";

const MIN = 60_000;
const holder = globalThis as unknown as { __loginLimiter?: RateLimiter };
/** One limiter for the whole server (kept across hot reloads, like the export manager). */
export function loginLimiter(): RateLimiter {
  holder.__loginLimiter ??= createRateLimiter({ max: 10, windowMs: 10 * MIN, blockMs: 10 * MIN });
  return holder.__loginLimiter;
}

/** The caller's address as the proxy in front of us reports it, or "local". */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Whether the visitor reached us over HTTPS (directly or through the cloud's proxy). */
export function isHttps(url: string, headers: Headers): boolean {
  return (
    url.startsWith("https:") || headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
  );
}

export async function loginResponse(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  limiter: RateLimiter = loginLimiter(),
  now: number = Date.now(),
): Promise<Response> {
  if (!loginEnabled(env.ACCOUNTS) || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return Response.json({ error: "Logins are not set up on this server." }, { status: 400 });
  }
  const ip = clientIp(request.headers);
  if (!limiter.check(ip, now)) return Response.json({ error: TOO_MANY }, { status: 429 });
  let body: { username?: unknown; password?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: WRONG_LOGIN }, { status: 400 });
  }
  const user = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const accounts = parseAccounts(env.ACCOUNTS);
  const stored = accounts.get(user);
  // Always run one scrypt check, so an unknown name takes as long as a wrong password.
  const matches = verifyPassword(password, stored ?? DUMMY_HASH) && stored !== undefined;
  if (!matches) {
    limiter.fail(ip, now);
    return Response.json({ error: WRONG_LOGIN }, { status: 401 });
  }
  limiter.succeed(ip);
  const next = safeNext(typeof body.next === "string" ? body.next : null);
  const response = Response.json({ next });
  const opts = cookieOptions(isHttps(request.url, request.headers));
  const cookie = [
    `${SESSION_COOKIE}=${signSession(user, env.SESSION_SECRET, now)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(opts.secure ? ["Secure"] : []),
  ].join("; ");
  response.headers.append("set-cookie", cookie);
  return response;
}

/** A Set-Cookie value that removes the session. */
export function logoutCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
