// POST /api/auth/login's logic: right and wrong logins, the attempt limit, the cookie.
import { describe, expect, it } from "vitest";
import { loginResponse, TOO_MANY, WRONG_LOGIN } from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/passwords";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { readSession } from "@/lib/auth/session";

const secret = "z".repeat(40);
const env = { ACCOUNTS: `ana:${hashPassword("password123")}`, SESSION_SECRET: secret };
const now = Date.UTC(2026, 10, 6);
const limiter = () => createRateLimiter({ max: 10, windowMs: 600_000, blockMs: 600_000 });

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://pod.example/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("login", () => {
  it("a right login sets a session cookie and returns a safe next page", async () => {
    const res = await loginResponse(
      post({ username: " Ana ", password: "password123", next: "//evil.example" }),
      env,
      limiter(),
      now,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: "/" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^mv_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure"); // plain http here
    const value = cookie.split(";")[0].split("=")[1];
    expect(readSession(value, secret, now)).toBe("ana");
  });

  it("marks the cookie Secure behind an HTTPS proxy", async () => {
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, { "x-forwarded-proto": "https" }),
      env,
      limiter(),
      now,
    );
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("wrong passwords and unknown names get the same answer", async () => {
    for (const body of [
      { username: "ana", password: "nope" },
      { username: "nobody", password: "password123" },
      { username: 5, password: null },
    ]) {
      const res = await loginResponse(post(body), env, limiter(), now);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: WRONG_LOGIN });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("after 10 wrong tries from one address, the 11th is refused", async () => {
    const l = limiter();
    const from = { "x-forwarded-for": "9.9.9.9, 10.0.0.1" };
    for (let i = 0; i < 10; i++) {
      expect(
        (await loginResponse(post({ username: "ana", password: "x" }, from), env, l, now)).status,
      ).toBe(401);
    }
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, from),
      env,
      l,
      now,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: TOO_MANY });
  });

  it("does nothing when logins aren't set up", async () => {
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }),
      {},
      limiter(),
      now,
    );
    expect(res.status).toBe(400);
  });
});
