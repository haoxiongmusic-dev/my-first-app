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
import { isCurrentAnalysis } from "@/lib/analysis";
import { venvPythonPath } from "@/lib/python";
import type { RunCommand } from "@/lib/run-command";

export const UNREADABLE_MESSAGE = "Couldn't read this audio file. Try WAV or MP3.";

export type SongErrorKind = "unreadable" | "too-short" | "analyzer-failed";

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

  const songId = await songIdFor(opts.sourcePath);
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
