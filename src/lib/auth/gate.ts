// Who gets in, decided for every request by src/proxy.ts. Logins are on only when ACCOUNTS is
// set (the cloud machine); on the owner's PC everything passes, exactly as before. With
// ACCOUNTS set, a missing or short SESSION_SECRET (or unreadable ACCOUNTS) stops the server
// rather than letting it run unprotected.
import { parseAccounts } from "@/lib/auth/passwords";
import { readSession } from "@/lib/auth/session";

export const MISCONFIGURED_MESSAGE =
  "This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.";
/** The cloud image sets REQUIRE_LOGIN=1, so a blank or missing ACCOUNTS can't open it up. */
export const NEEDS_ACCOUNTS_MESSAGE =
  "This server needs ACCOUNTS (the invited logins) because REQUIRE_LOGIN is set.";
const MIN_SECRET = 32;

export type Decision =
  | { kind: "pass" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" }
  | { kind: "misconfigured"; message: string };

/** Paths anyone may open: the login page, the login routes and the page's static files. */
export function isOpenPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/_next/static/") ||
    path === "/_next/image" ||
    path === "/favicon.ico"
  );
}

/** Whether logins are switched on (ACCOUNTS has any entries). */
export function loginEnabled(accounts: string | undefined): boolean {
  return (accounts ?? "").replace(/[\s,]/g, "") !== "";
}

let parsed: { source: string; accounts: Map<string, string> } | null = null;
function accountsFrom(value: string): Map<string, string> {
  if (parsed?.source !== value) parsed = { source: value, accounts: parseAccounts(value) };
  return parsed.accounts;
}

export function decide(input: {
  path: string;
  search?: string;
  accounts: string | undefined;
  secret: string | undefined;
  cookie: string | undefined;
  now: number;
  /** the cloud machine: logins must be on (REQUIRE_LOGIN=1) */
  requireLogin?: boolean;
}): Decision {
  if (!loginEnabled(input.accounts)) {
    return input.requireLogin
      ? { kind: "misconfigured", message: NEEDS_ACCOUNTS_MESSAGE }
      : { kind: "pass" };
  }
  let accounts: Map<string, string>;
  try {
    accounts = accountsFrom(input.accounts as string);
  } catch (error) {
    return { kind: "misconfigured", message: (error as Error).message };
  }
  if (!input.secret || input.secret.length < MIN_SECRET) {
    return { kind: "misconfigured", message: MISCONFIGURED_MESSAGE };
  }
  if (isOpenPath(input.path)) return { kind: "pass" };
  const user = readSession(input.cookie, input.secret, input.now);
  if (user && accounts.has(user)) return { kind: "pass" };
  const p = input.path;
  if (p.startsWith("/api/") || p.startsWith("/preview/") || p.startsWith("/_next/")) {
    return { kind: "unauthorized" };
  }
  return { kind: "redirect", to: "/login?next=" + encodeURIComponent(p + (input.search ?? "")) };
}

/** Control characters (tabs, newlines…), spaces, DEL or a backslash anywhere in the text. */
function hasUnsafeChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 32 || code === 127 || code === 92) return true; // 92 is the backslash
  }
  return false;
}

/**
 * Where to go after logging in: only ever a page on this site. Anything with control
 * characters, spaces or backslashes is refused (browsers drop tabs and newlines, which would
 * turn "/<tab>/evil.com" into "//evil.com"), and the rest is parsed to make sure it stays here.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (hasUnsafeChar(next)) return "/";
  const base = "http://this.site.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
