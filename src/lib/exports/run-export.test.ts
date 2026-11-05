import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Spawned, Spawner } from "@/lib/exports/processes";
import {
  ExportCancelled,
  ExportFailed,
  type ExportUpdate,
  runExport,
  uniqueExportPath,
} from "@/lib/exports/run-export";
import type { RunCommand } from "@/lib/run-command";

const SONG = "c".repeat(64);
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "export-"));
  const demo = path.join(root, "templates", "demo");
  await mkdir(path.join(demo, "assets"), { recursive: true });
  const vars = [
    { id: "title", type: "string", label: "Title", default: "SUNLIGHT" },
    { id: "artist", type: "string", label: "Artist", default: "AXIOM" },
    { id: "intensity", type: "number", label: "Intensity", default: 1 },
  ];
  await writeFile(
    path.join(demo, "index.html"),
    `<html data-composition-variables='${JSON.stringify(vars)}'><head></head><body>` +
      '<div id="root" data-composition-id="main" data-duration="20"></div></body></html>',
  );
  await writeFile(
    path.join(demo, "template.json"),
    JSON.stringify({
      name: "Demo",
      description: "",
      groups: [],
      basic: [],
      content: [],
      presets: [],
    }),
  );
  const songDir = path.join(root, "storage", "songs", SONG);
  await mkdir(songDir, { recursive: true });
  await writeFile(path.join(songDir, "song.wav"), "WAV");
  const frame = { b: [0], l: 0, k: 0, f: 0 };
  await writeFile(
    path.join(songDir, "analysis.json"),
    JSON.stringify({
      version: 1,
      fps: 30,
      bands: 1,
      duration: 20,
      frames: Array(600).fill(frame),
      hits: [],
    }),
  );
});

type Script = { lines: string[]; code: number; hang?: boolean };

/** Stand-ins for `npx hyperframes render` and `ffmpeg`: print scripted lines, write the output. */
function fakeSpawner(scripts: { render: Script; encode: Script }) {
  const started: { cmd: string; args: string[]; kill: () => void }[] = [];
  let nextPid = 100;
  const spawn: Spawner = (cmd, args) => {
    const isRender = args.includes("render");
    const script = isRender ? scripts.render : scripts.encode;
    const listeners: ((line: string) => void)[] = [];
    let finish: (code: number) => void = () => {};
    const done = new Promise<number>((resolve) => (finish = resolve));
    const spawned: Spawned = { pid: nextPid++, onLine: (cb) => listeners.push(cb), done };
    started.push({ cmd, args, kill: () => finish(1) });
    setTimeout(async () => {
      for (const line of script.lines) listeners.forEach((cb) => cb(line));
      if (script.hang) return;
      const out = isRender ? args[args.indexOf("-o") + 1] : args[args.length - 1];
      if (script.code === 0) await writeFile(out, "MP4");
      finish(script.code);
    }, 5);
    return spawned;
  };
  return { spawn, started };
}

const okRun: RunCommand = async () => ({ code: 0, stdout: "", stderr: "" });

function request() {
  return {
    templateId: "demo",
    songId: SONG,
    values: { title: "SUNLIGHT", artist: "AXIOM", intensity: 1 },
    quality: "final" as const,
    resolution: "1080p" as const,
  };
}

describe("runExport", () => {
  it("renders, encodes, reports progress and returns the file", async () => {
    const { spawn } = fakeSpawner({
      render: {
        code: 0,
        lines: ['@hf-progress {"code":"capture","done":200,"total":600,"pct":33}', "[INFO] noise"],
      },
      encode: { code: 0, lines: ["out_time_us=10000000", "progress=end"] },
    });
    const updates: ExportUpdate[] = [];
    const result = await runExport({
      exportId: "20261105-120000-abcd",
      request: request(),
      projectRoot: root,
      spawn,
      run: okRun,
      onUpdate: (u) => updates.push(u),
      signal: new AbortController().signal,
    });
    expect(result.file).toBe(path.join(root, "storage", "exports", "AXIOM - SUNLIGHT (Demo).mp4"));
    expect(existsSync(result.file)).toBe(true);
    expect(updates[0].stage).toBe("preparing");
    expect(updates).toContainEqual({ stage: "rendering", percent: 31, framesCaptured: 200 });
    expect(updates).toContainEqual({ stage: "encoding", percent: 95, framesCaptured: 200 });
    expect(existsSync(path.join(root, "storage", "jobs", "20261105-120000-abcd"))).toBe(false);
  });

  it("a failed render keeps the job folder and reports the last lines", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const { spawn } = fakeSpawner({ render: { code: 1, lines }, encode: { code: 0, lines: [] } });
    const error = await runExport({
      exportId: "20261105-120000-bbbb",
      request: request(),
      projectRoot: root,
      spawn,
      run: okRun,
      onUpdate: () => {},
      signal: new AbortController().signal,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportFailed);
    const tail = (error as ExportFailed).logTail;
    expect(tail).toHaveLength(20);
    expect(tail.at(-1)).toBe("line 30");
    expect(existsSync(path.join(root, "storage", "jobs", "20261105-120000-bbbb"))).toBe(true);
  });

  it("cancel kills the running step's process tree and removes the job folder", async () => {
    const { spawn, started } = fakeSpawner({
      render: {
        code: 0,
        lines: ['@hf-progress {"code":"capture","done":5,"total":600,"pct":26}'],
        hang: true,
      },
      encode: { code: 0, lines: [] },
    });
    const kills: string[][] = [];
    const run: RunCommand = async (cmd, args) => {
      kills.push([cmd, ...args]);
      started.forEach((s) => s.kill()); // the process tree ends
      return { code: 0, stdout: "", stderr: "" };
    };
    const controller = new AbortController();
    const attempt = runExport({
      exportId: "20261105-120000-cccc",
      request: request(),
      projectRoot: root,
      spawn,
      run,
      platform: "win32",
      onUpdate: (u) => {
        if (u.stage === "rendering") controller.abort();
      },
      signal: controller.signal,
    });
    await expect(attempt).rejects.toBeInstanceOf(ExportCancelled);
    expect(kills).toEqual([["taskkill", "/PID", "100", "/T", "/F"]]);
    expect(existsSync(path.join(root, "storage", "jobs", "20261105-120000-cccc"))).toBe(false);
    const exportsDir = path.join(root, "storage", "exports");
    expect(existsSync(exportsDir) ? await readdir(exportsDir) : []).toEqual([]);
  });

  it("settings not given in the request use the template's defaults", async () => {
    const { spawn } = fakeSpawner({
      render: { code: 0, lines: [] },
      encode: { code: 0, lines: [] },
    });
    const result = await runExport({
      exportId: "20261105-120000-dddd",
      request: { ...request(), values: { title: "T-REX" } },
      projectRoot: root,
      spawn,
      run: okRun,
      onUpdate: () => {},
      signal: new AbortController().signal,
    });
    expect(path.basename(result.file)).toBe("AXIOM - T-REX (Demo).mp4");
  });

  it("uniqueExportPath adds a number when the name is taken", async () => {
    const dir = path.join(root, "out");
    await mkdir(dir);
    expect(uniqueExportPath(dir, "a.mp4")).toBe(path.join(dir, "a.mp4"));
    await writeFile(path.join(dir, "a.mp4"), "");
    expect(uniqueExportPath(dir, "a.mp4")).toBe(path.join(dir, "a (2).mp4"));
    await writeFile(path.join(dir, "a (2).mp4"), "");
    expect(uniqueExportPath(dir, "a.mp4")).toBe(path.join(dir, "a (3).mp4"));
  });
});
