import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createExportManager, ExportBusy, ExportInvalid } from "@/lib/exports/manager";
import type { Spawner } from "@/lib/exports/processes";
import {
  ExportCancelled,
  ExportFailed,
  type ExportRequest,
  type RunExportOptions,
} from "@/lib/exports/run-export";
import type { RunCommand } from "@/lib/run-command";

const SONG = "d".repeat(64);
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "manager-"));
  const demo = path.join(root, "templates", "demo");
  await mkdir(demo, { recursive: true });
  const vars = [
    { id: "title", type: "string", label: "Title", default: "SUNLIGHT" },
    { id: "artist", type: "string", label: "Artist", default: "AXIOM" },
    { id: "intensity", type: "number", label: "Intensity", default: 1, min: 0.2, max: 2 },
  ];
  await writeFile(
    path.join(demo, "index.html"),
    `<html data-composition-variables='${JSON.stringify(vars)}'><body></body></html>`,
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
  await writeFile(
    path.join(songDir, "analysis.json"),
    JSON.stringify({ version: 1, fps: 30, bands: 1, duration: 252, frames: [], hits: [] }),
  );
});

/** A stand-in export run that the test finishes, fails or watches being cancelled. */
function controllableRun() {
  let options: RunExportOptions | null = null;
  let finish: (file: string) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const runExport = (o: RunExportOptions) =>
    new Promise<{ file: string }>((resolve, reject) => {
      options = o;
      finish = (file) => resolve({ file });
      fail = reject;
      o.signal.addEventListener("abort", () => reject(new ExportCancelled()));
    });
  return {
    runExport,
    get options() {
      return options as RunExportOptions | null;
    },
    finish: (file: string) => finish(file),
    fail: (error: Error) => fail(error),
  };
}

const unusedSpawn: Spawner = () => {
  throw new Error("not used");
};
const okRun: RunCommand = async () => ({ code: 0, stdout: "", stderr: "" });

function request(overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    templateId: "demo",
    songId: SONG,
    values: { title: "SUNLIGHT", artist: "AXIOM", intensity: 1 },
    quality: "final",
    resolution: "1080p",
    ...overrides,
  };
}

function manager(
  run: ReturnType<typeof controllableRun>,
  clock = { now: 1_000_000 },
  failureGraceMs = 0,
) {
  return createExportManager({
    projectRoot: root,
    spawn: unusedSpawn,
    run: okRun,
    runExport: run.runExport,
    now: () => clock.now,
    freeBytes: async () => 84e9,
    failureGraceMs,
  });
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("export manager", () => {
  it("starting runs the export and finishes as done", async () => {
    const run = controllableRun();
    const m = manager(run);
    const started = await m.start(request());
    expect(started.state).toBe("running");
    expect(started.estimateSeconds).toBe(1248);
    expect(started.exportId).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/);
    await settle();
    run.finish(path.join(root, "storage", "exports", "AXIOM - SUNLIGHT (Demo).mp4"));
    await settle();
    const done = await m.get(started.exportId);
    expect(done?.state).toBe("done");
    expect(done?.percent).toBe(100);
    expect(done?.fileName).toBe("AXIOM - SUNLIGHT (Demo).mp4");
    expect(m.current()).toBeNull();
    const saved = JSON.parse(
      await readFile(path.join(root, "storage", "exports", `${started.exportId}.json`), "utf8"),
    );
    expect(saved.state).toBe("done");
  });

  it("starting while one runs is refused", async () => {
    const run = controllableRun();
    const m = manager(run);
    const first = await m.start(request());
    await expect(m.start(request())).rejects.toBeInstanceOf(ExportBusy);
    await expect(m.start(request())).rejects.toThrow(
      "Another export is running. Wait for it to finish or cancel it.",
    );
    expect(m.current()?.exportId).toBe(first.exportId);
  });

  it("progress, elapsed and remaining are reported", async () => {
    const run = controllableRun();
    const clock = { now: 1_000_000 };
    const m = manager(run, clock);
    const started = await m.start(request());
    await settle();
    run.options?.onUpdate({ stage: "rendering", percent: 24, framesCaptured: 1 }); // capture starts
    clock.now += 1_200_000; // 20 minutes later
    run.options?.onUpdate({ stage: "rendering", percent: 60, framesCaptured: 500 });
    const status = await m.get(started.exportId);
    expect(status?.stage).toBe("rendering");
    expect(status?.percent).toBe(60);
    expect(status?.elapsedSeconds).toBe(1200);
    expect(status?.remainingSeconds).toBe(1333); // 36 % took 1200 s, so 40 % more ≈ 1333 s
  });

  it("cancel marks the export cancelled and frees the slot", async () => {
    const run = controllableRun();
    const m = manager(run);
    const started = await m.start(request());
    await settle();
    const cancelled = await m.cancel(started.exportId);
    expect(cancelled?.state).toBe("cancelled");
    expect(m.current()).toBeNull();
    expect((await m.start(request())).state).toBe("running");
  });

  it("a failed export reports its last log lines and frees the slot", async () => {
    const run = controllableRun();
    const m = manager(run);
    const started = await m.start(request());
    await settle();
    run.fail(new ExportFailed("The render failed.", ["a", "b"]));
    await settle();
    const failed = await m.get(started.exportId);
    expect(failed).toMatchObject({
      state: "failed",
      error: "The render failed.",
      logTail: ["a", "b"],
    });
    expect(m.current()).toBeNull();
  });

  it("loading marks unfinished exports as interrupted", async () => {
    const dir = path.join(root, "storage", "exports");
    await mkdir(dir, { recursive: true });
    const id = "20261105-101010-beef";
    await writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ exportId: id, state: "running", stage: "rendering", percent: 40 }),
    );
    const m = manager(controllableRun());
    const status = await m.get(id);
    expect(status?.state).toBe("failed");
    expect(status?.error).toBe("The app was restarted during this export.");
    expect((await m.start(request())).state).toBe("running");
  });

  it("invalid requests are rejected", async () => {
    const m = manager(controllableRun());
    await expect(m.start(request({ values: { nope: 1 } }))).rejects.toBeInstanceOf(ExportInvalid);
    await expect(m.start(request({ start: 20, end: 10 }))).rejects.toBeInstanceOf(ExportInvalid);
    await expect(m.start(request({ start: 0, end: 300 }))).rejects.toBeInstanceOf(ExportInvalid);
    await expect(m.start(request({ songId: "e".repeat(64) }))).rejects.toBeInstanceOf(
      ExportInvalid,
    );
    await expect(m.start(request({ templateId: "../x" }))).rejects.toBeInstanceOf(ExportInvalid);
    expect(await m.get("../../etc")).toBeNull();
  });

  it("freeBytes comes from the disk holding storage", async () => {
    expect(await manager(controllableRun()).freeBytes()).toBe(84e9);
  });

  it("time remaining counts from when frame capture began", async () => {
    const run = controllableRun();
    const clock = { now: 1_000_000 };
    const m = manager(run, clock);
    const started = await m.start(request());
    await settle();
    clock.now += 90_000;
    run.options?.onUpdate({ stage: "rendering", percent: 24, framesCaptured: 1 });
    clock.now += 3_600_000;
    run.options?.onUpdate({ stage: "rendering", percent: 40, framesCaptured: 20000 });
    expect((await m.get(started.exportId))?.remainingSeconds).toBe(13500);
  });

  it("a failed run waits briefly before recording the failure", async () => {
    // If the app is shutting down, the render dies first; waiting lets the shutdown win, so
    // the export is reported as interrupted by the restart instead of as a broken render.
    const run = controllableRun();
    const m = manager(run, { now: 1_000_000 }, 60);
    const started = await m.start(request());
    await settle();
    run.fail(new ExportFailed("The render failed.", []));
    await settle();
    const file = path.join(root, "storage", "exports", `${started.exportId}.json`);
    expect(JSON.parse(await readFile(file, "utf8")).state).toBe("running");
    // Then it is recorded (polled, so a busy machine running the whole suite can't fail this).
    const state = async () => JSON.parse(await readFile(file, "utf8")).state as string;
    for (let waited = 0; (await state()) !== "failed" && waited < 2000; waited += 20) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await state()).toBe("failed");
  });

  it("latest shows an export interrupted by a restart", async () => {
    const dir = path.join(root, "storage", "exports");
    await mkdir(dir, { recursive: true });
    for (const id of ["20261105-090000-aaaa", "20261105-101010-beef"]) {
      await writeFile(
        path.join(dir, `${id}.json`),
        JSON.stringify({ exportId: id, state: "running" }),
      );
    }
    const latest = await manager(controllableRun()).latest();
    expect(latest?.exportId).toBe("20261105-101010-beef");
    expect(latest?.state).toBe("failed");
    expect(latest?.error).toBe("The app was restarted during this export.");
  });

  it("a status file that can't be written doesn't block later exports", async () => {
    const statusDir = path.join(root, "storage", "exports");
    await mkdir(path.join(root, "storage"), { recursive: true });
    await writeFile(statusDir, "a file where the folder should be"); // writes will fail
    const m = manager(controllableRun());
    await expect(m.start(request())).rejects.toThrow();
    expect(m.current()).toBeNull();
    await rm(statusDir);
    expect((await m.start(request())).state).toBe("running");
  });
});
