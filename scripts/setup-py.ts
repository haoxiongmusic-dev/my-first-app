// Creates the analyzer's Python environment (analyzer/.venv) and installs its packages.
// Safe to run again: an existing environment is reused and packages are brought up to date.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { systemPythonCommand, venvPythonPath } from "../src/lib/python";

function run(step: string, cmd: string, args: string[]): void {
  console.log(`\n> ${step}: ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : `exit code ${result.status}`;
    console.error(`\nSetup failed while trying to ${step} (${reason}).`);
    process.exit(1);
  }
}

const venvPython = venvPythonPath(process.cwd(), process.platform);

if (existsSync(venvPython)) {
  console.log("Python environment already exists: analyzer/.venv");
} else {
  run("create the Python environment", systemPythonCommand(process.platform), [
    "-m",
    "venv",
    "analyzer/.venv",
  ]);
}

run("install the analyzer's packages", venvPython, [
  "-m",
  "pip",
  "install",
  "-r",
  "analyzer/requirements.txt",
]);

console.log("\nPython environment ready.");
