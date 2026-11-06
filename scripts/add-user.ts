// npm run add-user -- <username>
// Asks for a password (twice, not shown on screen) and prints the line to add to the ACCOUNTS
// setting on the cloud machine. The password itself is never stored or printed: only its
// scrypt fingerprint. Dev scripts compile as CommonJS, so no top-level await (see CLAUDE.md).
import {
  formatAccountLine,
  hashPassword,
  parseAccounts,
  passwordProblem,
} from "../src/lib/auth/passwords";

/** Read one line from the terminal without echoing it. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {
      reject(new Error("Run this in a terminal, so the password can be typed without showing."));
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(username)) {
    console.error("Usage: npm run add-user -- <username>   (letters, digits, . _ - ; up to 32)");
    process.exit(1);
  }
  const password = await askHidden(`Password for ${username} (12+ characters): `);
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  if ((await askHidden("Type it again: ")) !== password) {
    console.error("The two passwords were different.");
    process.exit(1);
  }
  const line = formatAccountLine(username, hashPassword(password));
  parseAccounts(line); // proves the line is readable
  console.log("\nAdd this to ACCOUNTS (separate several people with commas):\n");
  console.log(line);
  console.log(
    "\nThe server also needs SESSION_SECRET: a random 48-character text. Make one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(36).toString('base64url'))\"\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
