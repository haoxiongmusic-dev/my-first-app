// Runs before every request (Next.js 16 "proxy", Node runtime). With ACCOUNTS set (the cloud
// machine) only signed-in people get past the login page; with it unset (the owner's PC) every
// request passes, exactly as before. The cloud image also sets REQUIRE_LOGIN=1, so a blank
// ACCOUNTS stops the server instead of opening it.
//
// The upload routes (songs, images, backgrounds) are left out of the matcher on purpose: when
// the proxy runs on a route, Next copies the request body into memory and keeps only the first
// 10 MB, which cut long songs short. Those routes call requireLogin() themselves instead.
import { NextResponse, type NextRequest } from "next/server";
import { decide } from "@/lib/auth/gate";
import { SESSION_COOKIE } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const d = decide({
    path: request.nextUrl.pathname,
    search: request.nextUrl.search,
    accounts: process.env.ACCOUNTS,
    secret: process.env.SESSION_SECRET,
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    now: Date.now(),
    requireLogin: process.env.REQUIRE_LOGIN === "1",
  });
  switch (d.kind) {
    case "pass":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(d.to, request.url));
    case "unauthorized":
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    case "misconfigured":
      return new NextResponse(d.message, {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
  }
}

export const config = {
  // Everything except static files and the three upload routes (exact paths, anchored).
  matcher: ["/((?!_next/static/|favicon\\.ico$|api/songs$|api/images$|api/backgrounds$).*)"],
};
