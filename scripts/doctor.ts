// `npm run doctor`: checks this computer has every tool the app needs and says how to fix
// anything missing. Exits with code 1 if any check fails.
import { execFile } from "node:child_process";
import { runDoctor, type RunCommand } from "../src/lib/doctor";

const run: RunCommand = (cmd, args) =>
  new Promise((resolve, reject) => {
    // On Windows `npx` is a .cmd file, which Node can only start through a shell.
    // Other commands run without a shell so arguments like "import numpy; ..." stay intact.
    // With a shell, Node wants one command string (our npx arguments are fixed and safe).
    const shell = process.platform === "win32" && cmd === "npx";
    const file = shell ? [cmd, ...args].join(" ") : cmd;
    const fileArgs = shell ? [] : args;
    execFile(file, fileArgs, { shell, windowsHide: true }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error); // could not start the program at all
        return;
      }
      resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
    });
  });

async function main(): Promise<void> {
  const checks = await runDoctor({
    run,
    platform: process.platform,
    nodeVersion: process.versions.node,
    projectRoot: process.cwd(),
  });

  const width = Math.max(...checks.map((c) => c.name.length));
  for (const check of checks) {
    const name = check.name.padEnd(width);
    console.log(
      check.ok ? `✓ ${name}  ${check.detail}` : `✗ ${name}  ${check.detail}  →  ${check.fix ?? ""}`,
    );
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? "\nAll tools ready." : `\n${failed} problem(s) to fix.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
