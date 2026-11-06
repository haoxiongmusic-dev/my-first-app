/**
 * The export queue: one export at a time (spec §5, §9). Each export's status is kept in memory
 * while it runs and in storage/exports/<exportId>.json, so a reload shows it again and a
 * restarted app reports an export it never finished as failed instead of "running" forever.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "@/lib/exports/atomic-write";
import { spawnLines, type Spawner } from "@/lib/exports/processes";
import { estimateExportSeconds, remainingSeconds } from "@/lib/exports/progress";
import {
  ExportCancelled,
  ExportFailed,
  type ExportRequest,
  type ExportStage,
  runExport as realRunExport,
  type RunExportOptions,
} from "@/lib/exports/run-export";
import { runCommand, type RunCommand } from "@/lib/run-command";
import { songInfo } from "@/lib/songs";
import { IMAGE_MISSING_MESSAGE, imagePath } from "@/lib/images";
import { loadTemplate, validateValues } from "@/lib/templates";
import { storageRoot } from "@/lib/storage-root";

export type ExportState = "running" | "done" | "failed" | "cancelled";

export type ExportStatus = {
  exportId: string;
  state: ExportState;
  stage: ExportStage | null;
  percent: number;
  elapsedSeconds: number;
  remainingSeconds: number | null;
  estimateSeconds: number;
  fileName: string | null;
  error: string | null;
  logTail: string[];
  startedAt: string;
};

export const BUSY_MESSAGE = "Another export is running. Wait for it to finish or cancel it.";
export const INTERRUPTED_MESSAGE = "The app was restarted during this export.";
export const LOW_DISK_BYTES = 5e9;

export class ExportBusy extends Error {
  constructor() {
    super(BUSY_MESSAGE);
    this.name = "ExportBusy";
  }
}

export class ExportInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportInvalid";
  }
}

const EXPORT_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/;
const MEDIA_ID = /^[0-9a-f]{64}$/;
const MIN_SECTION_SECONDS = 1;

type Running = {
  status: ExportStatus;
  startedMs: number;
  framesCaptured: number;
  /** elapsed seconds and percent when the first frame was captured (for time remaining) */
  captureStart?: { elapsed: number; percent: number };
  controller: AbortController;
  finished: Promise<void>;
};

export type ExportManagerOptions = {
  projectRoot: string;
  spawn: Spawner;
  run: RunCommand;
  now?: () => number;
  freeBytes?: (dir: string) => Promise<number>;
  runExport?: (o: RunExportOptions) => Promise<{ file: string }>;
  /**
   * How long to wait before recording a failed render (default 2 s). When the app is shutting
   * down, the render dies first; waiting lets the shutdown finish, so the export stays marked
   * "running" and is reported as interrupted by the restart, not as a broken render.
   */
  failureGraceMs?: number;
};

function stamp(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-` +
    `${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
  );
}

async function diskFree(dir: string): Promise<number> {
  const s = await statfs(dir);
  return s.bavail * s.bsize;
}

export function createExportManager(o: ExportManagerOptions) {
  const now = o.now ?? Date.now;
  const runExport = o.runExport ?? realRunExport;
  const storage = storageRoot(o.projectRoot);
  const statusDir = path.join(storage, "exports");
  let current: Running | null = null;
  let lastSaved = 0;
  let saving: Promise<void> = Promise.resolve();

  const statusFile = (id: string) => path.join(statusDir, `${id}.json`);

  /**
   * Write a status file. Writes happen one after another; a failed write (e.g. a full disk)
   * doesn't stop later ones. Each is written to a temporary file and renamed into place, so a
   * crash never leaves half a file (retried briefly if Windows has the file open: writeFileAtomic).
   */
  function save(status: ExportStatus): Promise<void> {
    const copy = JSON.stringify(status, null, 2);
    const file = statusFile(status.exportId);
    saving = saving
      .catch(() => {})
      .then(async () => {
        await mkdir(statusDir, { recursive: true });
        await writeFileAtomic(file, copy);
      });
    return saving;
  }

  function live(r: Running): ExportStatus {
    const elapsed = Math.round((now() - r.startedMs) / 1000);
    return {
      ...r.status,
      elapsedSeconds: elapsed,
      remainingSeconds: remainingSeconds({
        elapsed,
        percent: r.status.percent,
        estimate: r.status.estimateSeconds,
        framesCaptured: r.framesCaptured,
        captureStart: r.captureStart,
      }),
    };
  }

  async function validate(request: ExportRequest): Promise<number> {
    if (!TEMPLATE_ID.test(request.templateId)) throw new ExportInvalid("Unknown template.");
    const templateDir = path.join(o.projectRoot, "templates", request.templateId);
    if (!existsSync(path.join(templateDir, "template.json")))
      throw new ExportInvalid("Unknown template.");
    const template = await loadTemplate(templateDir);
    const problems = validateValues(template.variables, request.values ?? {});
    if (problems.length > 0) throw new ExportInvalid(`Invalid settings: ${problems.join("; ")}`);
    for (const v of template.variables) {
      const id = request.values?.[v.id];
      if (v.type !== "image" || typeof id !== "string" || id === "") continue;
      if (!existsSync(imagePath(storage, id, v.fit))) {
        throw new ExportInvalid(IMAGE_MISSING_MESSAGE);
      }
    }
    if (request.quality !== "draft" && request.quality !== "final") {
      throw new ExportInvalid("Quality must be draft or final.");
    }
    if (request.resolution !== "1080p" && request.resolution !== "1440p") {
      throw new ExportInvalid("Resolution must be 1080p or 1440p.");
    }
    const song = await songInfo(storage, request.songId);
    if (!song) throw new ExportInvalid("Song not found. Upload it again.");
    const start = request.start ?? 0;
    const end = request.end ?? song.duration;
    if (!(start >= 0) || !(end <= song.duration + 0.05) || !(end - start >= MIN_SECTION_SECONDS)) {
      throw new ExportInvalid("The section must be inside the song and at least 1 second long.");
    }
    if (request.backgroundId !== undefined) {
      const ok =
        MEDIA_ID.test(request.backgroundId) &&
        existsSync(path.join(storage, "backgrounds", `${request.backgroundId}.jpg`));
      if (!ok) throw new ExportInvalid("Background image not found. Choose it again.");
    }
    return end - start;
  }

  async function finish(r: Running, change: Partial<ExportStatus>) {
    r.status = { ...live(r), ...change };
    current = null;
    await save(r.status);
  }

  return {
    async start(request: ExportRequest): Promise<ExportStatus> {
      if (current) throw new ExportBusy();
      const seconds = await validate(request);
      if (current) throw new ExportBusy(); // another start won the race while we validated
      const startedMs = now();
      const exportId = `${stamp(startedMs)}-${randomBytes(2).toString("hex")}`;
      const status: ExportStatus = {
        exportId,
        state: "running",
        stage: "preparing",
        percent: 0,
        elapsedSeconds: 0,
        remainingSeconds: null,
        estimateSeconds: estimateExportSeconds(seconds, request.quality, request.resolution),
        fileName: null,
        error: null,
        logTail: [],
        startedAt: new Date(startedMs).toISOString(),
      };
      const controller = new AbortController();
      const r: Running = {
        status,
        startedMs,
        framesCaptured: 0,
        controller,
        finished: Promise.resolve(),
      };
      current = r;
      try {
        await save(status);
      } catch (error) {
        current = null; // nothing started: don't leave the slot taken
        throw error;
      }
      lastSaved = now();

      r.finished = runExport({
        exportId,
        request,
        projectRoot: o.projectRoot,
        spawn: o.spawn,
        run: o.run,
        signal: controller.signal,
        onUpdate: (u) => {
          r.status = { ...r.status, stage: u.stage, percent: u.percent };
          r.framesCaptured = u.framesCaptured;
          if (!r.captureStart && u.framesCaptured > 0) {
            r.captureStart = { elapsed: (now() - r.startedMs) / 1000, percent: u.percent };
          }
          if (now() - lastSaved >= 1000) {
            lastSaved = now();
            save(live(r)).catch((error: unknown) =>
              console.error("Couldn't save export status:", error),
            );
          }
        },
      }).then(
        ({ file }) =>
          finish(r, {
            state: "done",
            percent: 100,
            remainingSeconds: 0,
            fileName: path.basename(file),
          }),
        async (error: unknown) => {
          if (error instanceof ExportCancelled) {
            return finish(r, { state: "cancelled", remainingSeconds: null, error: null });
          }
          const failed = error instanceof ExportFailed;
          const message = error instanceof Error ? error.message : String(error);
          await new Promise((resolve) => setTimeout(resolve, o.failureGraceMs ?? 2000));
          return finish(r, {
            state: "failed",
            remainingSeconds: null,
            error: message,
            logTail: failed ? (error as ExportFailed).logTail : [],
          });
        },
      );
      return live(r);
    },

    async get(exportId: string): Promise<ExportStatus | null> {
      if (!EXPORT_ID.test(exportId)) return null;
      if (current?.status.exportId === exportId) return live(current);
      await saving.catch(() => {});
      let status: ExportStatus;
      try {
        status = JSON.parse(await readFile(statusFile(exportId), "utf8")) as ExportStatus;
      } catch {
        return null;
      }
      if (status.state === "running") {
        // Not running in this app: it was cut off by a restart.
        status = { ...status, state: "failed", remainingSeconds: null, error: INTERRUPTED_MESSAGE };
        await save(status);
      }
      return status;
    },

    current(): ExportStatus | null {
      return current ? live(current) : null;
    },

    /** The running export, or else the most recent one (an interrupted one shows as failed). */
    async latest(): Promise<ExportStatus | null> {
      if (current) return live(current);
      let names: string[];
      try {
        names = await readdir(statusDir);
      } catch {
        return null;
      }
      const ids = names
        .filter((n) => n.endsWith(".json"))
        .map((n) => n.slice(0, -5))
        .filter((id) => EXPORT_ID.test(id))
        .sort();
      const newest = ids.at(-1);
      return newest ? this.get(newest) : null;
    },

    async cancel(exportId: string): Promise<ExportStatus | null> {
      const r = current;
      if (r && r.status.exportId === exportId) {
        r.controller.abort();
        await r.finished;
      }
      return this.get(exportId);
    },

    async filePath(exportId: string): Promise<string | null> {
      const status = await this.get(exportId);
      if (status?.state !== "done" || !status.fileName) return null;
      const file = path.join(statusDir, status.fileName);
      return existsSync(file) ? file : null;
    },

    async freeBytes(): Promise<number> {
      await mkdir(storage, { recursive: true });
      return (o.freeBytes ?? diskFree)(storage);
    },
  };
}

export type ExportManager = ReturnType<typeof createExportManager>;

const globalStore = globalThis as unknown as { __exportManager?: ExportManager };

/** The app's one export manager (kept on globalThis so dev reloads don't lose a running export). */
export function getExportManager(): ExportManager {
  globalStore.__exportManager ??= createExportManager({
    projectRoot: process.cwd(),
    spawn: spawnLines,
    run: runCommand,
  });
  return globalStore.__exportManager;
}
