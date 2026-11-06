// Invited accounts: passwords are kept only as scrypt fingerprints, read from ACCOUNTS.
import { describe, expect, it } from "vitest";
import {
  DUMMY_HASH,
  formatAccountLine,
  hashPassword,
  parseAccounts,
  verifyPassword,
} from "@/lib/auth/passwords";

describe("passwords", () => {
  it("a hash verifies its own password and nothing else", () => {
    const stored = hashPassword("correct horse");
    expect(stored).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("correct hors", stored)).toBe(false);
    expect(hashPassword("correct horse")).not.toBe(stored); // a fresh salt every time
  });

  it("malformed fingerprints never verify", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlysalt")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("anything", DUMMY_HASH)).toBe(false);
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
