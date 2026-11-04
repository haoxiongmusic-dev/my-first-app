import { systemPythonCommand, venvPythonPath } from "@/lib/python";
import type { CommandResult, RunCommand } from "@/lib/run-command";

export type { CommandResult, RunCommand };
export type ToolCheck = { name: string; ok: boolean; detail: string; fix?: string };

export const HYPERFRAMES_VERSION = "0.9.10";

const MIN_NODE_MAJOR = 22;
const MIN_PYTHON_MINOR = 10;
const FFMPEG_FIX = "winget install Gyan.FFmpeg";

/** Run a command, treating "could not start it" the same as a failed run. */
async function tryRun(run: RunCommand, cmd: string, args: string[]): Promise<CommandResult | null> {
  try {
    const result = await run(cmd, args);
    return result.code === 0 ? result : null;
  } catch {
    return null;
  }
}

function pass(name: string, detail: string): ToolCheck {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string, fix: string): ToolCheck {
  return { name, ok: false, detail, fix };
}

function checkNode(nodeVersion: string): ToolCheck {
  const major = Number.parseInt(nodeVersion, 10);
  return major >= MIN_NODE_MAJOR
    ? pass("Node.js", nodeVersion)
    : fail(
        "Node.js",
        `found ${nodeVersion}, need ${MIN_NODE_MAJOR}+`,
        `Install Node.js ${MIN_NODE_MAJOR} or newer from https://nodejs.org`,
      );
}

async function checkFfTool(run: RunCommand, tool: "ffmpeg" | "ffprobe"): Promise<ToolCheck> {
  const name = tool === "ffmpeg" ? "FFmpeg" : "ffprobe";
  const result = await tryRun(run, tool, ["-version"]);
  const match = result?.stdout.match(new RegExp(`^${tool} version (\\S+)`));
  if (!match) return fail(name, "not found", FFMPEG_FIX);
  // "8.1.1-full_build-www.gyan.dev" -> "8.1.1"
  return pass(name, match[1].split("-")[0]);
}

async function checkPython(run: RunCommand, platform: NodeJS.Platform): Promise<ToolCheck> {
  // The python.org Windows installer leaves "Add python.exe to PATH" unticked by default;
  // without it, `python` keeps running the Microsoft Store stub (exit code 9009).
  const fix =
    platform === "win32"
      ? `Install Python 3.${MIN_PYTHON_MINOR}+ from https://www.python.org (tick "Add python.exe to PATH"), then open a new terminal`
      : `Install Python 3.${MIN_PYTHON_MINOR}+ from https://www.python.org`;
  const result = await tryRun(run, systemPythonCommand(platform), ["--version"]);
  // Older Pythons print the version on stderr.
  const text = result ? `${result.stdout} ${result.stderr}` : "";
  const match = text.match(/Python 3\.(\d+)(\.\d+)?/);
  if (!match) return fail("Python", "not found", fix);
  const version = match[0].replace("Python ", "");
  return Number(match[1]) >= MIN_PYTHON_MINOR
    ? pass("Python", version)
    : fail("Python", `found ${version}, need 3.${MIN_PYTHON_MINOR}+`, fix);
}

async function checkPythonEnv(
  run: RunCommand,
  platform: NodeJS.Platform,
  projectRoot: string,
): Promise<ToolCheck> {
  const python = venvPythonPath(projectRoot, platform);
  const result = await tryRun(run, python, ["-c", "import numpy; print(numpy.__version__)"]);
  const version = result?.stdout.trim();
  return version
    ? pass("Python environment", `NumPy ${version}`)
    : fail("Python environment", "not set up", "npm run setup:py");
}

async function checkHyperFrames(run: RunCommand): Promise<ToolCheck> {
  const fix = `npm install --save-dev --save-exact hyperframes@${HYPERFRAMES_VERSION}`;
  const result = await tryRun(run, "npx", ["--no-install", "hyperframes", "--version"]);
  const found = result?.stdout.trim().split(/\s+/).pop();
  if (!found) return fail("HyperFrames", "not found", fix);
  return found === HYPERFRAMES_VERSION
    ? pass("HyperFrames", found)
    : fail("HyperFrames", `found ${found}, need ${HYPERFRAMES_VERSION}`, fix);
}

/**
 * Check that this computer has every tool the app needs. Every check runs even when an
 * earlier one fails, so one run lists everything that needs fixing.
 */
export async function runDoctor(opts: {
  run: RunCommand;
  platform: NodeJS.Platform;
  nodeVersion: string;
  projectRoot: string;
}): Promise<ToolCheck[]> {
  const { run, platform, nodeVersion, projectRoot } = opts;
  return [
    checkNode(nodeVersion),
    await checkFfTool(run, "ffmpeg"),
    await checkFfTool(run, "ffprobe"),
    await checkPython(run, platform),
    await checkPythonEnv(run, platform, projectRoot),
    await checkHyperFrames(run),
  ];
}
