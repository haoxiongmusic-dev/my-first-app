/**
 * A render job folder (spec §9): a copy of one template with a real song's audio and
 * analysis in its fixed asset paths, its song-length durations set, and the chosen settings
 * applied. HyperFrames renders the folder as it is; the template itself is never modified.
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCurrentAnalysis, toAudioDataJs } from "@/lib/analysis";
import type { RunCommand } from "@/lib/run-command";
import { type Template, type TemplateValues, validateValues } from "@/lib/templates";

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

export type PrepareJobOptions = {
  template: Template;
  song: { wavPath: string; analysisPath: string };
  values: TemplateValues;
  jobDir: string;
  /** an image to use as assets/background.jpg */
  backgroundPath?: string;
  run: RunCommand;
};

export type PreparedJob = {
  jobDir: string;
  indexPath: string;
  variablesPath: string;
  /** seconds */
  duration: number;
};

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
  await cp(opts.song.wavPath, path.join(assets, "song.wav"));

  const analysis: unknown = JSON.parse(await readFile(opts.song.analysisPath, "utf8"));
  if (!isCurrentAnalysis(analysis)) {
    throw new JobError("The song's analysis is missing or out of date: analyze it again");
  }
  await writeFile(path.join(assets, "audio-data.js"), toAudioDataJs(analysis));

  const indexPath = path.join(opts.jobDir, "index.html");
  const html = await readFile(indexPath, "utf8");
  await writeFile(
    indexPath,
    withVariableDefaults(setSongLength(html, analysis.duration), opts.values),
  );

  const variablesPath = path.join(opts.jobDir, "variables.json");
  await writeFile(variablesPath, JSON.stringify(opts.values, null, 2));

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
