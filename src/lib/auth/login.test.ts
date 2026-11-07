// POST /api/auth/login's logic: right and wrong logins, the attempt limit, the cookie.
import { describe, expect, it, vi } from "vitest";
import {
  clientIp,
  createLoginLimits,
  loginResponse,
  MAX_LOGIN_BODY,
  MAX_PASSWORD,
  TOO_BIG,
  TOO_MANY,
  WRONG_LOGIN,
} from "@/lib/auth/login";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

// The real password functions, with verifyPassword watched (to prove when scrypt is skipped).
vi.mock("@/lib/auth/passwords", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/passwords")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});
import { readSession } from "@/lib/auth/session";

const secret = "z".repeat(40);
const env = { ACCOUNTS: `ana:${hashPassword("password123")}`, SESSION_SECRET: secret };
const now = Date.UTC(2026, 10, 6);
const limiter = () => createLoginLimits();

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

  it("the size limits are 4 KB for the request and 256 characters for the password", () => {
    expect(MAX_LOGIN_BODY).toBe(4096);
    expect(MAX_PASSWORD).toBe(256);
    expect(TOO_BIG).toBe("That request is too big.");
  });

  it("refuses a body over 4 KB", async () => {
    const res = await loginResponse(
      post({ username: "ana", password: "password123", pad: "x".repeat(5000) }),
      env,
      limiter(),
      now,
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: TOO_BIG });
  });

  it("refuses a chunked body over 4 KB", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ username: "ana", password: "password123", pad: "x".repeat(5000) }),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 1000) controller.enqueue(bytes.slice(i, i + 1000));
        controller.close();
      },
    });
    const request = new Request("http://pod.example/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const res = await loginResponse(request, env, limiter(), now);
    expect(res.status).toBe(413);
  });

  it("a password over 256 characters is a wrong login without scrypt", async () => {
    const l = limiter();
    const from = { "x-forwarded-for": "8.8.8.8" };
    vi.mocked(verifyPassword).mockClear();
    for (let i = 0; i < 10; i++) {
      const res = await loginResponse(
        post({ username: "ana", password: "p".repeat(257) }, from),
        env,
        l,
        now,
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: WRONG_LOGIN });
    }
    expect(verifyPassword).not.toHaveBeenCalled();
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, from),
      env,
      l,
      now,
    );
    expect(res.status).toBe(429); // those tries counted
  });

  it("a normal-sized login still works", async () => {
    const res = await loginResponse(
      post({ username: "ana", password: "password123", next: `/${"a".repeat(150)}` }),
      env,
      limiter(),
      now,
    );
    expect(res.status).toBe(200);
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

  it("uses the real address: Cloudflare's header, else the last forwarded entry", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(
      clientIp(h({ "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1, 8.8.8.8" })),
    ).toBe("8.8.8.8");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(h({}))).toBe("local");
  });

  it("faking the first forwarded address does not reset the limit", async () => {
    const l = limiter();
    for (let i = 0; i < 10; i++) {
      const from = { "x-forwarded-for": `1.1.1.${i}, 7.7.7.7` };
      await loginResponse(post({ username: "ana", password: "x" }, from), env, l, now);
    }
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, { "x-forwarded-for": "2.2.2.2, 7.7.7.7" }),
      env,
      l,
      now,
    );
    expect(res.status).toBe(429);
  });

  it("caps guesses at one username even from many addresses", async () => {
    const l = limiter();
    for (let i = 0; i < 10; i++) {
      const from = { "cf-connecting-ip": `3.3.3.${i}` };
      await loginResponse(post({ username: "ana", password: "x" }, from), env, l, now);
    }
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, { "cf-connecting-ip": "4.4.4.4" }),
      env,
      l,
      now,
    );
    expect(res.status).toBe(429);
  });

  // 50 real scrypt checks: give it time when the whole suite is running at once.
  it("caps guesses across the whole server", { timeout: 30_000 }, async () => {
    const l = limiter();
    for (let i = 0; i < 50; i++) {
      const from = { "cf-connecting-ip": `5.5.${Math.floor(i / 9)}.${i % 9}` };
      await loginResponse(post({ username: `u${i % 7}`, password: "x" }, from), env, l, now);
    }
    const res = await loginResponse(
      post({ username: "ana", password: "password123" }, { "cf-connecting-ip": "6.6.6.6" }),
      env,
      l,
      now,
    );
    expect(res.status).toBe(429);
  });
});
