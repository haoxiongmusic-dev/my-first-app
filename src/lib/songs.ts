/**
 * The song cache. Each song is identified by the SHA-256 fingerprint of its file, and gets a
 * folder `storage/songs/<fingerprint>/` holding:
 *   song.wav       the song converted to stereo 44.1 kHz WAV (for preview and render)
 *   analysis.json  what the analyzer found (bands, loudness, kicks, hits)
 * so the same song is never converted or analyzed twice.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { type Analysis, isCurrentAnalysis } from "@/lib/analysis";
import { venvPythonPath } from "@/lib/python";
import type { RunCommand } from "@/lib/run-command";
import {
  MAX_SONG_BYTES,
  MAX_SONG_SECONDS,
  TOO_BIG_MESSAGE,
  TOO_LONG_MESSAGE,
  UNREADABLE_MESSAGE,
} from "@/lib/limits";

export { MAX_SONG_BYTES, MAX_SONG_SECONDS, TOO_BIG_MESSAGE, TOO_LONG_MESSAGE, UNREADABLE_MESSAGE };

export type SongErrorKind = "unreadable" | "too-short" | "too-long" | "too-big" | "analyzer-failed";

export class SongError extends Error {
  constructor(
    readonly kind: SongErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SongError";
  }
}

export type PreparedSong = {
  songId: string;
  dir: string;
  wavPath: string;
  analysisPath: string;
  /** seconds */
  duration: number;
  /** true when the song was already converted and analyzed */
  cached: boolean;
};

export type PrepareSongOptions = {
  sourcePath: string;
  storageRoot: string;
  projectRoot: string;
  platform: NodeJS.Platform;
  run: RunCommand;
  /** reject longer songs before converting or analyzing them */
  maxSeconds?: number;
};

/** The song's fingerprint: lowercase hex SHA-256 of the file, read in pieces. */
export function songIdFor(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Duration of a cached analysis, or null if it is missing, broken or out of date. */
async function readCachedDuration(analysisPath: string): Promise<number | null> {
  try {
    const value: unknown = JSON.parse(await readFile(analysisPath, "utf8"));
    return isCurrentAnalysis(value) ? value.duration : null;
  } catch {
    return null;
  }
}

/** The last non-empty line of a program's error output. */
function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "no error message";
}

/** Convert and analyze a song, or reuse the cached result. Throws SongError on failure. */
export async function prepareSong(opts: PrepareSongOptions): Promise<PreparedSong> {
  if (!existsSync(opts.sourcePath)) {
    throw new SongError("unreadable", `Couldn't find this file: ${opts.sourcePath}`);
  }

  if (opts.maxSeconds !== undefined) {
    const seconds = await probeDuration(opts.sourcePath, opts.run);
    if (seconds !== null && seconds > opts.maxSeconds) {
      throw new SongError("too-long", TOO_LONG_MESSAGE);
    }
  }

  const songId = await songIdFor(opts.sourcePath);
  // The same song picked twice while the first is still converting shares that work, so two
  // runs never write the same folder at once.
  const key = path.join(opts.storageRoot, "songs", songId);
  const running = inFlight.get(key);
  if (running) return running;
  const work = convertAndAnalyze(opts, songId);
  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

const inFlight = new Map<string, Promise<PreparedSong>>();

async function convertAndAnalyze(opts: PrepareSongOptions, songId: string): Promise<PreparedSong> {
  const dir = path.join(opts.storageRoot, "songs", songId);
  const wavPath = path.join(dir, "song.wav");
  const analysisPath = path.join(dir, "analysis.json");
  const song = { songId, dir, wavPath, analysisPath };

  if (existsSync(wavPath)) {
    const duration = await readCachedDuration(analysisPath);
    if (duration !== null) return { ...song, duration, cached: true };
  }

  await mkdir(dir, { recursive: true });
  // Work in uniquely named temporary files and rename them into place only when complete,
  // so a crash never leaves a half-written file that looks finished.
  const tmpWav = path.join(dir, `song.${randomUUID()}.tmp.wav`);
  const tmpAnalysis = path.join(dir, `analysis.${randomUUID()}.tmp.json`);

  try {
    const convert = await opts.run("ffmpeg", [
      ...["-y", "-v", "error", "-i", opts.sourcePath, "-vn"],
      ...["-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", tmpWav],
    ]);
    if (convert.code !== 0) throw new SongError("unreadable", UNREADABLE_MESSAGE);
    await rename(tmpWav, wavPath);

    const python = venvPythonPath(opts.projectRoot, opts.platform);
    const analyzer = path.join(opts.projectRoot, "analyzer", "analyze.py");
    const analyze = await opts.run(python, [analyzer, wavPath, "--out", tmpAnalysis]);
    // Exit 2: converted, but no audio inside (e.g. an interrupted recording).
    if (analyze.code === 2) throw new SongError("unreadable", UNREADABLE_MESSAGE);
    if (analyze.code === 3) throw new SongError("too-short", analyze.stderr.trim());
    if (analyze.code !== 0) {
      throw new SongError("analyzer-failed", `Analysis failed: ${lastLine(analyze.stderr)}`);
    }
    await rename(tmpAnalysis, analysisPath);
  } finally {
    await rm(tmpWav, { force: true });
    await rm(tmpAnalysis, { force: true });
  }

  const duration = await readCachedDuration(analysisPath);
  if (duration === null) {
    throw new SongError("analyzer-failed", "Analysis failed: the analyzer wrote an unusable file");
  }
  return { ...song, duration, cached: false };
}

/** A file's length in seconds as FFprobe reads it, or null if it can't be read. */
export async function probeDuration(filePath: string, run: RunCommand): Promise<number | null> {
  const probe = await run("ffprobe", [
    ...["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
  ]);
  const seconds = Number(probe.stdout.trim());
  return probe.code === 0 && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** The loudest moment of each of `count` equal slices of the song: a waveform to draw. */
export function peaksFromAnalysis(analysis: Analysis, count = 400): number[] {
  const frames = analysis.frames;
  const slices = Math.min(count, frames.length);
  const peaks: number[] = [];
  for (let i = 0; i < slices; i++) {
    const from = Math.floor((i * frames.length) / slices);
    const to = Math.floor(((i + 1) * frames.length) / slices);
    let peak = 0;
    for (let j = from; j < to; j++) peak = Math.max(peak, frames[j].l);
    peaks.push(Math.round(peak * 1000) / 1000);
  }
  return peaks;
}

export type SongInfo = { songId: string; duration: number; peaks: number[] };

const SONG_ID = /^[0-9a-f]{64}$/;

/** A cached song's length and waveform, or null if there is no such (analyzed) song. */
export async function songInfo(storageRoot: string, songId: string): Promise<SongInfo | null> {
  if (!SONG_ID.test(songId)) return null;
  const dir = path.join(storageRoot, "songs", songId);
  if (!existsSync(path.join(dir, "song.wav"))) return null;
  try {
    const analysis: unknown = JSON.parse(await readFile(path.join(dir, "analysis.json"), "utf8"));
    if (!isCurrentAnalysis(analysis)) return null;
    return { songId, duration: analysis.duration, peaks: peaksFromAnalysis(analysis) };
  } catch {
    return null;
  }
}
