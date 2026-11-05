// `npm run doctor`: checks this computer has every tool the app needs and says how to fix
// anything missing. Exits with code 1 if any check fails.
import { runDoctor } from "../src/lib/doctor";
import { runCommand } from "../src/lib/run-command";

async function main(): Promise<void> {
  const checks = await runDoctor({
    run: runCommand,
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
