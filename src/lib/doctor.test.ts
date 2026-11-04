import { describe, expect, it } from "vitest";
import { runDoctor, type CommandResult, type RunCommand, type ToolCheck } from "@/lib/doctor";

const ROOT = "C:\\dev\\AppProject";
const VENV_PY = "C:\\dev\\AppProject\\analyzer\\.venv\\Scripts\\python.exe";

const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: "" });

const ALL_GOOD: Record<string, CommandResult> = {
  "ffmpeg -version": ok("ffmpeg version 8.1.1-full_build-www.gyan.dev Copyright (c) 2000-2026"),
  "ffprobe -version": ok("ffprobe version 8.1.1-full_build-www.gyan.dev Copyright (c) 2007-2026"),
  "python --version": ok("Python 3.14.5"),
  [`${VENV_PY} -c import numpy; print(numpy.__version__)`]: ok("2.5.4"),
  "npx --no-install hyperframes --version": ok("0.9.10"),
};

/** A fake command runner: known commands return their result, unknown ones throw. */
function fake(table: Record<string, CommandResult>, seen: string[] = []): RunCommand {
  return async (cmd, args) => {
    const key = [cmd, ...args].join(" ");
    seen.push(key);
    const result = table[key];
    if (!result) throw new Error(`spawn ${cmd} ENOENT`);
    return result;
  };
}

function without(key: string): Record<string, CommandResult> {
  const table = { ...ALL_GOOD };
  delete table[key];
  return table;
}

const base = {
  run: fake(ALL_GOOD),
  platform: "win32" as NodeJS.Platform,
  nodeVersion: "26.2.0",
  projectRoot: ROOT,
};

const byName = (checks: ToolCheck[], name: string): ToolCheck => {
  const found = checks.find((c) => c.name === name);
  if (!found) throw new Error(`no check named ${name}`);
  return found;
};

describe("runDoctor", () => {
  it("passes on a fully set-up Windows PC", async () => {
    const checks = await runDoctor(base);
    expect(checks.map((c) => c.name)).toEqual([
      "Node.js",
      "FFmpeg",
      "ffprobe",
      "Python",
      "Python environment",
      "HyperFrames",
    ]);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(byName(checks, "FFmpeg").detail).toBe("8.1.1");
    expect(byName(checks, "HyperFrames").detail).toBe("0.9.10");
  });

  it("reports ffprobe separately when only FFmpeg is installed", async () => {
    const checks = await runDoctor({ ...base, run: fake(without("ffprobe -version")) });
    expect(byName(checks, "FFmpeg").ok).toBe(true);
    expect(byName(checks, "ffprobe")).toMatchObject({
      ok: false,
      detail: "not found",
      fix: "winget install Gyan.FFmpeg",
    });
  });

  it("flags the wrong HyperFrames version", async () => {
    const table = { ...ALL_GOOD, "npx --no-install hyperframes --version": ok("0.9.11") };
    const checks = await runDoctor({ ...base, run: fake(table) });
    expect(byName(checks, "HyperFrames")).toMatchObject({
      ok: false,
      detail: "found 0.9.11, need 0.9.10",
      fix: "npm install --save-dev --save-exact hyperframes@0.9.10",
    });
  });

  it("rejects Node older than 22", async () => {
    const checks = await runDoctor({ ...base, nodeVersion: "20.11.0" });
    expect(byName(checks, "Node.js")).toMatchObject({
      ok: false,
      fix: "Install Node.js 22 or newer from https://nodejs.org",
    });
  });

  it("rejects Python older than 3.10", async () => {
    const table = { ...ALL_GOOD, "python --version": ok("Python 3.8.10") };
    const checks = await runDoctor({ ...base, run: fake(table) });
    expect(byName(checks, "Python")).toMatchObject({
      ok: false,
      fix: "Install Python 3.10+ from https://www.python.org",
    });
  });

  it("asks for setup:py when the venv has no NumPy", async () => {
    const checks = await runDoctor({
      ...base,
      run: fake(without(`${VENV_PY} -c import numpy; print(numpy.__version__)`)),
    });
    expect(byName(checks, "Python environment")).toMatchObject({
      ok: false,
      fix: "npm run setup:py",
    });
  });

  it("treats a failing exit code as not ok", async () => {
    const table = { ...ALL_GOOD, "ffmpeg -version": { code: 1, stdout: "", stderr: "boom" } };
    const checks = await runDoctor({ ...base, run: fake(table) });
    expect(byName(checks, "FFmpeg").ok).toBe(false);
  });

  it("uses `python` on Windows and `python3` elsewhere", async () => {
    const winSeen: string[] = [];
    await runDoctor({ ...base, run: fake(ALL_GOOD, winSeen) });
    expect(winSeen).toContain("python --version");

    const linuxSeen: string[] = [];
    await runDoctor({
      ...base,
      platform: "linux",
      projectRoot: "/home/me/app",
      run: fake({}, linuxSeen),
    });
    expect(linuxSeen).toContain("python3 --version");
    expect(linuxSeen).toContain(
      "/home/me/app/analyzer/.venv/bin/python -c import numpy; print(numpy.__version__)",
    );
  });
});
