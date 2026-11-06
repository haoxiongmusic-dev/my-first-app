// POST /api/auth/logout: forget the session cookie.
import { logoutCookie } from "@/lib/auth/login";

export async function POST(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", logoutCookie());
  return response;
}
