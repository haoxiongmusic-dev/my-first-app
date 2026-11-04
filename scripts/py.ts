// Runs the analyzer's own Python (analyzer/.venv) with whatever arguments it was given,
// e.g. `tsx scripts/py.ts -m pytest`. Works the same on Windows, macOS and Linux.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { venvPythonPath } from "../src/lib/python";

const python = venvPythonPath(process.cwd(), process.platform);

if (!existsSync(python)) {
  console.error("Python environment not set up. Run: npm run setup:py");
  process.exit(1);
}

const result = spawnSync(python, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
