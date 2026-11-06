// Invited accounts: passwords are kept only as scrypt fingerprints, read from ACCOUNTS.
import { describe, expect, it } from "vitest";
import {
  DUMMY_HASH,
  formatAccountLine,
  hashPassword,
  envFileLine,
  passwordProblem,
  parseAccounts,
  verifyPassword,
} from "@/lib/auth/passwords";

describe("passwords", () => {
  it("a hash verifies its own password and nothing else", async () => {
    const stored = hashPassword("correct horse");
    expect(stored).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct hors", stored)).toBe(false);
    expect(hashPassword("correct horse")).not.toBe(stored); // a fresh salt every time
  });

  it("malformed fingerprints never verify", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$onlysalt")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("anything", DUMMY_HASH)).toBe(false);
  });

  it("checking a password doesn't block the server (it runs off the main thread)", () => {
    expect(verifyPassword("x", DUMMY_HASH)).toBeInstanceOf(Promise);
  });

  it("add-user asks for passwords of 12+ characters", () => {
    expect(passwordProblem("short-pass1")).toBe("Use at least 12 characters.");
    expect(passwordProblem("twelve-chars")).toBeNull();
    // the login refuses anything longer, so add-user must too
    expect(passwordProblem("p".repeat(256))).toBeNull();
    expect(passwordProblem("p".repeat(257))).toBe("Use at most 256 characters.");
  });

  it("an ACCOUNTS line for a .env file writes each $ as \\$", () => {
    expect(envFileLine("ana:scrypt$a$b")).toBe("ana:scrypt\\$a\\$b");
    expect(envFileLine("no-dollars")).toBe("no-dollars");
  });

  it("parses ACCOUNTS typed by hand: spaces, empty entries, case", () => {
    const accounts = parseAccounts(" ana:scrypt$a$b , ,BOB:scrypt$c$d,");
    expect([...accounts.keys()]).toEqual(["ana", "bob"]);
    expect(accounts.get("bob")).toBe("scrypt$c$d");
    expect(parseAccounts(undefined).size).toBe(0);
    expect(parseAccounts("  ").size).toBe(0);
  });

  it("rejects entries it can't read, naming which one", () => {
    expect(() => parseAccounts("ana")).toThrow("ACCOUNTS entry 1 is not username:scrypt$…");
    expect(() => parseAccounts("ana:scrypt$a$b,b:c")).toThrow("ACCOUNTS entry 2");
    expect(() => parseAccounts("bad name!:scrypt$a$b")).toThrow("ACCOUNTS entry 1");
  });

  it("formats the line add-user prints", () => {
    expect(formatAccountLine("Ana", "scrypt$s$h")).toBe("ana:scrypt$s$h");
  });
});
