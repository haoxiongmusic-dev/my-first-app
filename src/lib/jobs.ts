/**
 * A render job folder (spec §9): a copy of one template with a real song's audio and
 * analysis in its fixed asset paths, its song-length durations set, and the chosen settings
 * applied. HyperFrames renders the folder as it is; the template itself is never modified.
 */
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { type Analysis, isCurrentAnalysis, toAudioDataJs } from "@/lib/analysis";
import { IMAGE_MISSING_MESSAGE, imagePath } from "@/lib/images";
import type { RunCommand } from "@/lib/run-command";
import {
  type Template,
  type TemplateValues,
  type TemplateVariable,
  validateValues,
} from "@/lib/templates";

export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

export const UNREADABLE_IMAGE_MESSAGE = "Couldn't read this image. Try JPG or PNG.";

/** Template files a job never copies: the dev sample song and data, and preset thumbnails. */
const SKIPPED = [
  path.join("assets", "song.wav"),
  path.join("assets", "audio-data.js"),
  "presets",
  ".hyperframes",
];

const TAG = /<[a-zA-Z][^>]*>/g;
const DURATION = /(\sdata-duration=")[^"]*(")/;
const SONG_LENGTH = /\sdata-song-length(?=[\s=/>])/;

/**
 * Set the composition root's duration and that of every element marked `data-song-length`
 * (HyperFrames variables can't change durations, so the job builder writes them).
 */
export function setSongLength(html: string, seconds: number): string {
  const value = seconds.toFixed(3);
  let rootDone = false;
  const result = html.replace(TAG, (tag) => {
    const isRoot = !rootDone && tag.includes("data-composition-id");
    if (isRoot) rootDone = true;
    if (!isRoot && !SONG_LENGTH.test(tag)) return tag;
    if (!DURATION.test(tag)) {
      throw new JobError(`An element that lasts the whole song has no data-duration: ${tag}`);
    }
    return tag.replace(DURATION, `$1${value}$2`);
  });
  if (!rootDone) throw new JobError("index.html has no composition root (data-composition-id)");
  return result;
}

/** Make the given values the variables' defaults, so previews and snapshots show them too. */
export function withVariableDefaults(html: string, values: TemplateValues): string {
  return html.replace(
    /(<html\b[^>]*data-composition-variables=')([^']*)(')/i,
    (_, start, json, end) => {
      const decoded = json
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      const vars = JSON.parse(decoded) as { id: string; default: unknown }[];
      for (const v of vars) if (v.id in values) v.default = values[v.id];
      return start + JSON.stringify(vars).replace(/&/g, "&amp;").replace(/'/g, "&#39;") + end;
    },
  );
}

/** Seconds of analysis kept before a section, so effects that look back in time (like the
 * spectrum history of Particle Horizon) are already full on the section's first frame. */
export const SECTION_PREROLL = 6;

/** The part of an analysis from `start` to `end` (seconds), plus up to `preroll` before it. */
export function sliceAnalysis(
  analysis: Analysis,
  start: number,
  end: number,
  preroll: number = SECTION_PREROLL,
): Analysis & { offset: number } {
  const fps = analysis.fps;
  const first = Math.max(0, Math.round((start - preroll) * fps));
  const last = Math.min(analysis.frames.length - 1, Math.round(end * fps));
  const from = first / fps;
  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    ...analysis,
    duration: round(end - start),
    offset: round(start - from),
    frames: analysis.frames.slice(first, last + 1),
    hits: analysis.hits
      .filter(([t]) => t >= from && t <= end)
      .map(([t, s]) => [round(t - from), s] as [number, number]),
  };
}

/**
 * Beats in the Hz beat ranges are judged against the whole song's loudness. A section only
 * holds part of the song, so it carries the whole song's scales, worked out by the template's
 * own toolkit (templates without a toolkit get none).
 */
function wholeSongBeatScales(
  template: Template,
  full: Analysis,
): { beatScales?: Record<string, number> } {
  const toolkitPath = path.join(template.dir, "assets", "viz-toolkit.js");
  if (!existsSync(toolkitPath)) return {};
  const toolkit = createRequire(toolkitPath)(toolkitPath) as {
    beatScales?: (frames: Analysis["frames"]) => Record<string, number>;
  };
  return toolkit.beatScales ? { beatScales: toolkit.beatScales(full.frames) } : {};
}

export type PrepareJobOptions = {
  template: Template;
  song: { wavPath: string; analysisPath: string };
  values: TemplateValues;
  jobDir: string;
  /** an image to use as assets/background.jpg */
  backgroundPath?: string;
  /** the app's storage folder, where image settings' pictures are kept (storage/images/) */
  storageRoot?: string;
  /** render only this part of the song (seconds) */
  section?: { start: number; end: number };
  run: RunCommand;
};

export type PreparedJob = {
  jobDir: string;
  indexPath: string;
  variablesPath: string;
  /** seconds */
  duration: number;
};

/**
 * Copy each image setting's picture into the job as assets/images/<settingId>.jpg and return
 * the values with that path in place of the image id (the template loads the path; ids never
 * reach templates). An empty image stays "". A picture that is gone stops the job.
 */
export async function placeImages(
  variables: TemplateVariable[],
  values: TemplateValues,
  storageRoot: string | undefined,
  jobDir: string,
): Promise<TemplateValues> {
  const placed = { ...values };
  for (const v of variables) {
    const id = values[v.id];
    if (v.type !== "image" || typeof id !== "string" || id === "") continue;
    const stored = storageRoot ? imagePath(storageRoot, id, v.fit) : null;
    if (!stored || !existsSync(stored)) throw new JobError(IMAGE_MISSING_MESSAGE);
    const relative = `assets/images/${v.id}.jpg`;
    await mkdir(path.join(jobDir, "assets", "images"), { recursive: true });
    await copyFile(stored, path.join(jobDir, relative));
    placed[v.id] = relative;
  }
  return placed;
}

/** Build a job folder ready for `hyperframes render` (or preview / snapshot). */
export async function prepareJob(opts: PrepareJobOptions): Promise<PreparedJob> {
  const problems = validateValues(opts.template.variables, opts.values);
  if (problems.length > 0) throw new JobError(`Invalid settings: ${problems.join("; ")}`);

  const source = opts.template.dir;
  await mkdir(opts.jobDir, { recursive: true });
  await cp(source, opts.jobDir, {
    recursive: true,
    filter: (file) => !SKIPPED.includes(path.relative(source, file)),
  });

  const assets = path.join(opts.jobDir, "assets");
  await mkdir(assets, { recursive: true });

  const full: unknown = JSON.parse(await readFile(opts.song.analysisPath, "utf8"));
  if (!isCurrentAnalysis(full)) {
    throw new JobError("The song's analysis is missing or out of date: analyze it again");
  }
  let analysis: Analysis = full;
  const wavOut = path.join(assets, "song.wav");
  if (opts.section) {
    const start = opts.section.start;
    const end = Math.min(opts.section.end, full.duration);
    if (start < 0 || start >= full.duration || end <= start) {
      throw new JobError(`The section must be inside the song (0 to ${full.duration} s)`);
    }
    analysis = { ...sliceAnalysis(full, start, end), ...wholeSongBeatScales(opts.template, full) };
    // Trim with 50 ms fades so the cut doesn't click.
    const length = analysis.duration;
    const trim = await opts.run("ffmpeg", [
      ...["-y", "-v", "error", "-ss", String(start), "-t", String(length), "-i", opts.song.wavPath],
      ...["-af", `afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, length - 0.05)}:d=0.05`],
      ...["-c:a", "pcm_s16le", wavOut],
    ]);
    if (trim.code !== 0) throw new JobError(`Couldn't cut the section: ${trim.stderr.trim()}`);
  } else {
    await cp(opts.song.wavPath, wavOut);
  }
  await writeFile(path.join(assets, "audio-data.js"), toAudioDataJs(analysis));

  // Image ids were checked above; from here on the values hold picture paths instead.
  const values = await placeImages(
    opts.template.variables,
    opts.values,
    opts.storageRoot,
    opts.jobDir,
  );

  const indexPath = path.join(opts.jobDir, "index.html");
  const html = await readFile(indexPath, "utf8");
  await writeFile(indexPath, withVariableDefaults(setSongLength(html, analysis.duration), values));

  const variablesPath = path.join(opts.jobDir, "variables.json");
  await writeFile(variablesPath, JSON.stringify(values, null, 2));

  if (opts.backgroundPath) {
    const result = await opts.run("ffmpeg", [
      ...["-y", "-v", "error", "-i", opts.backgroundPath],
      ...["-vf", "scale='min(1920,iw)':-2", "-frames:v", "1", "-q:v", "2"],
      path.join(assets, "background.jpg"),
    ]);
    if (result.code !== 0) throw new JobError(UNREADABLE_IMAGE_MESSAGE);
  }

  return { jobDir: opts.jobDir, indexPath, variablesPath, duration: analysis.duration };
}
