import path from "node:path";

/**
 * The command that starts the system Python.
 * On Windows `python3` is a Microsoft Store placeholder, so we use `python`.
 */
export function systemPythonCommand(platform: NodeJS.Platform): string {
  return platform === "win32" ? "python" : "python3";
}

/** Where the analyzer's own Python lives inside `analyzer/.venv`. */
export function venvPythonPath(projectRoot: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.win32.join(projectRoot, "analyzer", ".venv", "Scripts", "python.exe")
    : path.posix.join(projectRoot, "analyzer", ".venv", "bin", "python");
}
