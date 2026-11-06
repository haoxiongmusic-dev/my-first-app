// The login check for routes the proxy skips: the upload routes. Next copies a request body
// into memory whenever the proxy runs on a route, and keeps only the first 10 MB, which cut
// long songs short. So the proxy leaves those routes alone and they call this first instead.
import { decide } from "@/lib/auth/gate";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** The session cookie's value from a request's Cookie header. */
function sessionCookie(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** null when the request may go on; otherwise the response to send instead (401 or 500). */
export function requireLogin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Response | null {
  const d = decide({
    path: new URL(request.url).pathname,
    accounts: env.ACCOUNTS,
    secret: env.SESSION_SECRET,
    cookie: sessionCookie(request),
    now,
    requireLogin: env.REQUIRE_LOGIN === "1",
  });
  if (d.kind === "pass") return null;
  if (d.kind === "misconfigured") {
    return new Response(d.message, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return Response.json({ error: "Please log in." }, { status: 401 });
}
