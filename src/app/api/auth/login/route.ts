// POST /api/auth/login { username, password, next } → 200 { next } with the session cookie,
// 401 for a wrong username or password, 429 after too many attempts.
import { loginResponse } from "@/lib/auth/login";

export async function POST(request: Request): Promise<Response> {
  return loginResponse(request);
}
