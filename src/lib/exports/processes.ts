/**
 * Long-running programs (the HyperFrames render, FFmpeg) whose output is read line by line as
 * it arrives, for the progress bar, and whose whole process tree can be stopped on Cancel.
 */
import { spawn } from "node:child_process";

export type Spawned = {
  pid: number | undefined;
  /** Called for every output line (stdout and stderr; progress bars split on \r). */
  onLine(callback: (line: string) => void): void;
  /** Resolves with the exit code when the program ends. */
  done: Promise<number>;
};

export type Spawner = (cmd: string, args: string[]) => Spawned;

export const spawnLines: Spawner = (cmd, args) => {
  // On Windows `npx` is a .cmd file, which needs a shell: give it one quoted command string.
  const shell = process.platform === "win32" && cmd === "npx";
  const quoted = args.map((a) => (/[\s"&()]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a));
  const child = shell
    ? spawn([cmd, ...quoted].join(" "), { shell: true, windowsHide: true })
    : spawn(cmd, args, { windowsHide: true });
  const listeners: ((line: string) => void)[] = [];
  const emit = (line: string) => {
    if (line.trim() !== "") listeners.forEach((cb) => cb(line));
  };
  const reader = () => {
    let rest = "";
    return (chunk: Buffer) => {
      const parts = (rest + chunk.toString("utf8")).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? "";
      parts.forEach(emit);
    };
  };
  child.stdout?.on("data", reader());
  child.stderr?.on("data", reader());
  const done = new Promise<number>((resolve) => {
    child.on("error", (error) => {
      emit(`Couldn't start ${cmd}: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
  return { pid: child.pid, onLine: (cb) => listeners.push(cb), done };
};

/** The command that stops a process and everything it started (Chrome, FFmpeg…). */
export function killTreeArgs(pid: number, platform: NodeJS.Platform): [string, string[]] {
  return platform === "win32"
    ? ["taskkill", ["/PID", String(pid), "/T", "/F"]]
    : ["kill", ["-TERM", `-${pid}`]];
}
