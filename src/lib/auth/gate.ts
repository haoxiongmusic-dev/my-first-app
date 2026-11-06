// Who gets in, decided for every request by src/proxy.ts. Logins are on only when ACCOUNTS is
// set (the cloud machine); on the owner's PC everything passes, exactly as before. With
// ACCOUNTS set, a missing or short SESSION_SECRET (or unreadable ACCOUNTS) stops the server
// rather than letting it run unprotected.
import { parseAccounts } from "@/lib/auth/passwords";
import { readSession } from "@/lib/auth/session";

export const MISCONFIGURED_MESSAGE =
  "This server needs SESSION_SECRET (32+ characters) because ACCOUNTS is set.";
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
}): Decision {
  if (!loginEnabled(input.accounts)) return { kind: "pass" };
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

/** Where to go after logging in: only ever a page on this site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
