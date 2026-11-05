/**
 * One export, start to finish (spec §9):
 *   1. a job folder: the template with the song (or section), background and settings
 *   2. HyperFrames renders it to raw.mp4 (progress from its "@hf-progress" lines)
 *   3. FFmpeg re-encodes it into storage/exports/ (progress from its "-progress" lines)
 *   4. the job folder is deleted (kept if something failed, for checking)
 * Cancelling stops whichever program is running, with everything it started.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { exportEncodeArgs } from "@/lib/encode";
import { killTreeArgs, type Spawner } from "@/lib/exports/processes";
import {
  overallPercent,
  parseFfmpegProgressSeconds,
  parseHfProgress,
  type Quality,
  type Resolution,
} from "@/lib/exports/progress";
import { prepareJob } from "@/lib/jobs";
import { outputName } from "@/lib/render-args";
import type { RunCommand } from "@/lib/run-command";
import { defaultValues, loadTemplate, type TemplateValues } from "@/lib/templates";

export type ExportRequest = {
  templateId: string;
  songId: string;
  values: TemplateValues;
  /** seconds; both absent = the whole song */
  start?: number;
  end?: number;
  quality: Quality;
  resolution: Resolution;
  /** an image saved with saveBackground (storage/backgrounds/<id>.jpg) */
  backgroundId?: string;
};

export type ExportStage = "preparing" | "rendering" | "encoding";
export type ExportUpdate = { stage: ExportStage; percent: number; framesCaptured: number };

export class ExportFailed extends Error {
  constructor(
    message: string,
    readonly logTail: string[],
  ) {
    super(message);
    this.name = "ExportFailed";
  }
}

export class ExportCancelled extends Error {
  constructor() {
    super("The export was cancelled.");
    this.name = "ExportCancelled";
  }
}

/** "a.mp4", or "a (2).mp4", "a (3).mp4"… if that name is already taken in `dir`. */
export function uniqueExportPath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let n = 2; existsSync(candidate); n++) candidate = path.join(dir, `${base} (${n})${ext}`);
  return candidate;
}

export type RunExportOptions = {
  exportId: string;
  request: ExportRequest;
  projectRoot: string;
  spawn: Spawner;
  run: RunCommand;
  onUpdate: (update: ExportUpdate) => void;
  signal: AbortSignal;
  platform?: NodeJS.Platform;
};

const LOG_TAIL = 20;

export async function runExport(o: RunExportOptions): Promise<{ file: string }> {
  const { request } = o;
  const storage = path.join(o.projectRoot, "storage");
  const jobDir = path.join(storage, "jobs", o.exportId);
  const log: string[] = [];
  let partFile: string | null = null;
  let frames = 0;

  const cleanUp = async () => {
    await rm(jobDir, { recursive: true, force: true });
    if (partFile) await rm(partFile, { force: true });
  };
  const stopIfCancelled = async () => {
    if (!o.signal.aborted) return;
    await cleanUp();
    throw new ExportCancelled();
  };

  /** Run one program, passing its lines to `onLine`; stop it (and its children) on Cancel. */
  const step = async (cmd: string, args: string[], onLine: (line: string) => void) => {
    const child = o.spawn(cmd, args);
    child.onLine((line) => {
      log.push(line);
      if (log.length > 200) log.shift();
      onLine(line);
    });
    const stop = () => {
      if (child.pid !== undefined) {
        const [killCmd, killArgs] = killTreeArgs(child.pid, o.platform ?? process.platform);
        void o.run(killCmd, killArgs);
      }
    };
    o.signal.addEventListener("abort", stop, { once: true });
    try {
      return await child.done;
    } finally {
      o.signal.removeEventListener("abort", stop);
    }
  };

  o.onUpdate({ stage: "preparing", percent: overallPercent("preparing", 0), framesCaptured: 0 });
  await stopIfCancelled();
  const template = await loadTemplate(path.join(o.projectRoot, "templates", request.templateId));
  // Anything the request leaves out takes the template's default (title, artist… name the file).
  const values = { ...defaultValues(template.variables), ...request.values };
  const songDir = path.join(storage, "songs", request.songId);
  const section =
    request.start !== undefined || request.end !== undefined
      ? { start: request.start ?? 0, end: request.end ?? Number.POSITIVE_INFINITY }
      : undefined;
  const job = await prepareJob({
    template,
    song: {
      wavPath: path.join(songDir, "song.wav"),
      analysisPath: path.join(songDir, "analysis.json"),
    },
    values,
    jobDir,
    section,
    backgroundPath: request.backgroundId
      ? path.join(storage, "backgrounds", `${request.backgroundId}.jpg`)
      : undefined,
    run: o.run,
  });
  o.onUpdate({ stage: "preparing", percent: overallPercent("preparing", 100), framesCaptured: 0 });
  await stopIfCancelled();

  // Render.
  const raw = path.join(jobDir, "raw.mp4");
  const quality = request.quality === "draft" ? "draft" : "delivery";
  const renderCode = await step(
    "npx",
    [
      ...["hyperframes", "render", jobDir, "--variables-file", job.variablesPath],
      ...["--strict-variables", "--quality", quality, "-o", raw],
    ],
    (line) => {
      const p = parseHfProgress(line);
      if (!p) return;
      if (p.code === "capture" && p.done !== undefined) frames = p.done;
      o.onUpdate({
        stage: "rendering",
        percent: overallPercent("rendering", p.pct),
        framesCaptured: frames,
      });
    },
  );
  await stopIfCancelled();
  if (renderCode !== 0 || !existsSync(raw)) {
    throw new ExportFailed("The render failed.", log.slice(-LOG_TAIL));
  }

  // Encode into storage/exports/, under a temporary name until it's complete.
  const exportsDir = path.join(storage, "exports");
  await mkdir(exportsDir, { recursive: true });
  const name = outputName(values, template.manifest.name, request.start, request.end);
  const finalFile = uniqueExportPath(exportsDir, name);
  partFile = finalFile.replace(/\.mp4$/, ".part.mp4");
  const encodeCode = await step(
    "ffmpeg",
    exportEncodeArgs(raw, partFile, { quality: request.quality, resolution: request.resolution }),
    (line) => {
      const seconds = parseFfmpegProgressSeconds(line);
      if (seconds === null) return;
      const pct = (seconds / Math.max(job.duration, 0.001)) * 100;
      o.onUpdate({
        stage: "encoding",
        percent: overallPercent("encoding", pct),
        framesCaptured: frames,
      });
    },
  );
  await stopIfCancelled();
  if (encodeCode !== 0) {
    await rm(partFile, { force: true });
    throw new ExportFailed("The final encode failed.", log.slice(-LOG_TAIL));
  }

  await rename(partFile, finalFile);
  partFile = null;
  await rm(jobDir, { recursive: true, force: true });
  return { file: finalFile };
}
