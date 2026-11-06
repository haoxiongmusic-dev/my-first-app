// Runs before every request (Next.js 16 "proxy", Node runtime). With ACCOUNTS set (the cloud
// machine) only signed-in people get past the login page; with it unset (the owner's PC) every
// request passes, exactly as before. It never reads request bodies, so big uploads stream
// straight through to their routes.
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
