// GET /api/auth/status: whether logins are on here and who is signed in (open to everyone, so
// pages can decide whether to show "Log out").
import { cookies } from "next/headers";
import { loginEnabled } from "@/lib/auth/gate";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(): Promise<Response> {
  const enabled = loginEnabled(process.env.ACCOUNTS);
  const secret = process.env.SESSION_SECRET;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = enabled && secret ? readSession(cookie, secret) : null;
  return Response.json({ loginEnabled: enabled, user });
}
