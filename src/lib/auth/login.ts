// The login check behind POST /api/auth/login, kept apart from the route so it can be tested.
import { safeNext, loginEnabled } from "@/lib/auth/gate";
import { DUMMY_HASH, parseAccounts, verifyPassword } from "@/lib/auth/passwords";
import { createRateLimiter, type RateLimiter } from "@/lib/auth/rate-limit";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth/session";

export const WRONG_LOGIN = "Wrong username or password.";
export const TOO_MANY = "Too many attempts: try again in 10 minutes.";

const MIN = 60_000;

/**
 * Three limits on wrong logins, each 10 minutes: per address (10), per username (10, so many
 * addresses can't all guess one person's password) and for the whole server (50, far above what
 * a few invited people ever reach).
 */
export type LoginLimits = { ip: RateLimiter; user: RateLimiter; all: RateLimiter };
export function createLoginLimits(): LoginLimits {
  const window = { windowMs: 10 * MIN, blockMs: 10 * MIN };
  return {
    ip: createRateLimiter({ max: 10, ...window }),
    user: createRateLimiter({ max: 10, ...window }),
    all: createRateLimiter({ max: 50, ...window }),
  };
}

const holder = globalThis as unknown as { __loginLimits?: LoginLimits };
/** One set of limits for the whole server (kept across hot reloads, like the export manager). */
export function loginLimits(): LoginLimits {
  holder.__loginLimits ??= createLoginLimits();
  return holder.__loginLimits;
}

/**
 * The caller's real address: Cloudflare's own header, else the last x-forwarded-for entry
 * (the one the proxy in front of us added; earlier entries are whatever the caller sent),
 * else "local".
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return forwarded.at(-1) ?? "local";
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
  limits: LoginLimits = loginLimits(),
  now: number = Date.now(),
): Promise<Response> {
  if (!loginEnabled(env.ACCOUNTS) || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return Response.json({ error: "Logins are not set up on this server." }, { status: 400 });
  }
  let body: { username?: unknown; password?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: WRONG_LOGIN }, { status: 400 });
  }
  const user = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIp(request.headers);
  const userKey = user.slice(0, 64);
  if (
    !limits.ip.check(ip, now) ||
    !limits.user.check(userKey, now) ||
    !limits.all.check("*", now)
  ) {
    return Response.json({ error: TOO_MANY }, { status: 429 });
  }
  const accounts = parseAccounts(env.ACCOUNTS);
  const stored = accounts.get(user);
  // Always run one scrypt check, so an unknown name takes as long as a wrong password.
  const matches = (await verifyPassword(password, stored ?? DUMMY_HASH)) && stored !== undefined;
  if (!matches) {
    limits.ip.fail(ip, now);
    limits.user.fail(userKey, now);
    limits.all.fail("*", now);
    return Response.json({ error: WRONG_LOGIN }, { status: 401 });
  }
  limits.ip.succeed(ip);
  limits.user.succeed(userKey);
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
