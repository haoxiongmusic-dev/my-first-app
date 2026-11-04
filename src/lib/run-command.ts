import { execFile } from "node:child_process";

export type CommandResult = { code: number; stdout: string; stderr: string };
export type RunCommand = (cmd: string, args: string[]) => Promise<CommandResult>;

/**
 * Run a program and collect its output. Resolves with the exit code (even when it is not 0)
 * and rejects only if the program could not be started at all.
 */
export const runCommand: RunCommand = (cmd, args) =>
  new Promise((resolve, reject) => {
    // On Windows `npx` is a .cmd file, which Node can only start through a shell.
    // Other commands run without a shell so arguments like "import numpy; ..." stay intact.
    // With a shell, Node wants one command string (our npx arguments are fixed and safe).
    const shell = process.platform === "win32" && cmd === "npx";
    const file = shell ? [cmd, ...args].join(" ") : cmd;
    const fileArgs = shell ? [] : args;
    // FFmpeg can print a line per broken packet of a damaged file (well over Node's 1 MB
    // default), and hitting the limit would kill it instead of returning its exit code.
    const options = { shell, windowsHide: true, maxBuffer: 64 * 1024 * 1024 };
    execFile(file, fileArgs, options, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") {
        reject(error); // could not start the program at all
        return;
      }
      resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
    });
  });
