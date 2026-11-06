// Who gets in: the decision behind src/proxy.ts, as a pure function.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decide, MISCONFIGURED_MESSAGE, NEEDS_ACCOUNTS_MESSAGE, safeNext } from "@/lib/auth/gate";
import { hashPassword } from "@/lib/auth/passwords";
import { signSession } from "@/lib/auth/session";

const secret = "k".repeat(40);
const accounts = `ana:${hashPassword("password123")}`;
const now = Date.UTC(2026, 10, 6);
const base = { accounts, secret, cookie: undefined, now };

describe("the login gate", () => {
  it("lets everything through when no accounts are set (the owner's PC)", () => {
    for (const p of ["/", "/edit/halo-rings", "/api/songs", "/preview/a/b/index.html"]) {
      expect(decide({ ...base, accounts: undefined, secret: undefined, path: p })).toEqual({
        kind: "pass",
      });
    }
  });

  it("refuses to run unprotected when the secret is missing or short", () => {
    for (const s of [undefined, "", "short"]) {
      expect(decide({ ...base, secret: s, path: "/" })).toEqual({
        kind: "misconfigured",
        message: MISCONFIGURED_MESSAGE,
      });
    }
    expect(MISCONFIGURED_MESSAGE).toBe(
      "This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.",
    );
  });

  it("refuses to run unprotected when ACCOUNTS can't be read", () => {
    const d = decide({ ...base, accounts: "ana", path: "/" });
    expect(d.kind).toBe("misconfigured");
  });

  it("keeps only the login page, the auth routes and static files open", () => {
    for (const p of [
      "/login",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/status",
      "/_next/static/chunks/x.js",
      "/_next/image",
      "/favicon.ico",
    ]) {
      expect(decide({ ...base, path: p }).kind, p).toBe("pass");
    }
  });

  it("sends signed-out pages to the login page and refuses signed-out API calls", () => {
    expect(decide({ ...base, path: "/" })).toEqual({ kind: "redirect", to: "/login?next=%2F" });
    expect(decide({ ...base, path: "/edit/halo-rings" })).toEqual({
      kind: "redirect",
      to: "/login?next=%2Fedit%2Fhalo-rings",
    });
    for (const p of [
      "/api/songs",
      "/api/exports",
      "/api/images/abc/square.jpg",
      "/preview/halo-rings/sample/index.html",
      "/_next/data/x.json",
      "/loginx",
      "/api/authx",
    ]) {
      expect(decide({ ...base, path: p }).kind, p).not.toBe("pass");
    }
    expect(decide({ ...base, path: "/api/songs" }).kind).toBe("unauthorized");
    expect(decide({ ...base, path: "/preview/a/b/index.html" }).kind).toBe("unauthorized");
  });

  it("lets a signed-in person through everywhere", () => {
    const cookie = signSession("ana", secret, now);
    for (const p of ["/", "/api/songs", "/preview/a/b/index.html"]) {
      expect(decide({ ...base, cookie, path: p })).toEqual({ kind: "pass" });
    }
  });

  it("a session for a removed account no longer works", () => {
    const cookie = signSession("bob", secret, now);
    expect(decide({ ...base, cookie, path: "/api/songs" }).kind).toBe("unauthorized");
  });

  it("on the cloud machine, missing accounts stop the server instead of opening it", () => {
    for (const a of [undefined, "", " ", ","]) {
      expect(decide({ ...base, accounts: a, requireLogin: true, path: "/" })).toEqual({
        kind: "misconfigured",
        message: NEEDS_ACCOUNTS_MESSAGE,
      });
    }
    expect(NEEDS_ACCOUNTS_MESSAGE).toBe(
      "This server needs ACCOUNTS (the invited logins) because REQUIRE_LOGIN is set.",
    );
  });

  it("only follows ?next= to a page on this site", () => {
    expect(safeNext("/edit/x?y=1")).toBe("/edit/x?y=1");
    expect(safeNext("/edit/x#a")).toBe("/edit/x#a");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "",
      null,
      "/\t/evil.com", // browsers drop tabs and newlines, so this would become //evil.com
      "/\n/evil.com",
      "/\r/evil.com",
      "/\t\\evil.com",
      "/ /evil.com",
    ]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/");
    }
  });

  it("the proxy never reads request bodies, so big uploads stream straight through", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(src).not.toMatch(/request\.(body|json|formData|text|arrayBuffer|blob)\b/);
  });
});
