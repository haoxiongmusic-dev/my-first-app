// Invited accounts. Passwords are never stored: only a scrypt fingerprint
// ("scrypt$<salt>$<hash>", base64url), which can check a password but not reveal it. The list
// comes from the ACCOUNTS setting: "username:scrypt$…,username:scrypt$…".
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_BYTES = 32;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const USERNAME = /^[a-z0-9._-]{1,32}$/;

/** A fresh fingerprint of the password (a new random salt every time). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_BYTES, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** scrypt off the main thread, so a burst of logins can't freeze the server. */
function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, SCRYPT, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Whether the password matches the fingerprint. Malformed fingerprints never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    if (salt.length === 0 || expected.length !== KEY_BYTES) return false;
    const actual = await scryptAsync(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Why a new password isn't good enough for `npm run add-user`, or null if it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  return null;
}

/** The longest password a login accepts (longer ones are refused without a scrypt check). */
export const MAX_PASSWORD = 256;

/**
 * The same ACCOUNTS line for a .env file: Next's .env loader reads "$name" as a variable, so
 * each $ is written as \$. (RunPod's settings take the line as it is.)
 */
export function envFileLine(line: string): string {
  return line.replaceAll("$", "\\$");
}

/**
 * A valid fingerprint of a random password nobody knows. Unknown usernames are checked
 * against it, so a wrong username takes as long as a wrong password.
 */
export const DUMMY_HASH = hashPassword(randomBytes(24).toString("hex"));

/**
 * The ACCOUNTS setting as username → fingerprint. Spaces and empty entries are ignored and
 * usernames are lower-cased; an entry that can't be read throws, naming its position.
 */
export function parseAccounts(value: string | undefined): Map<string, string> {
  const accounts = new Map<string, string>();
  const entries = (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e !== "");
  entries.forEach((entry, i) => {
    const colon = entry.indexOf(":");
    const user = colon > 0 ? entry.slice(0, colon).trim().toLowerCase() : "";
    const hash = colon > 0 ? entry.slice(colon + 1).trim() : "";
    if (!USERNAME.test(user) || !hash.startsWith("scrypt$")) {
      throw new Error(`ACCOUNTS entry ${i + 1} is not username:scrypt$…`);
    }
    accounts.set(user, hash);
  });
  return accounts;
}

/** The line `npm run add-user` prints, ready to add to ACCOUNTS. */
export function formatAccountLine(username: string, hash: string): string {
  return `${username.trim().toLowerCase()}:${hash}`;
}
