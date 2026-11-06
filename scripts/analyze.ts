// `npm run analyze -- <audio file> [--js <out.js>]`: converts and analyzes a song into
// storage/songs/<fingerprint>/ (or reuses it if already done) and prints a summary.
// With --js it also writes the analysis as a `window.AUDIO_DATA` script for template work.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isCurrentAnalysis, toAudioDataJs } from "../src/lib/analysis";
import { formatDuration } from "../src/lib/format";
import { runCommand } from "../src/lib/run-command";
import { prepareSong, SongError } from "../src/lib/songs";
import { storageRoot } from "../src/lib/storage-root";

const USAGE = "Usage: npm run analyze -- <audio file> [--js <out.js>]";

function parseArgs(argv: string[]): { source: string; js?: string } | null {
  const jsAt = argv.indexOf("--js");
  const js = jsAt >= 0 ? argv[jsAt + 1] : undefined;
  if (jsAt >= 0 && !js) return null;
  const rest = argv.filter((_, i) => jsAt < 0 || (i !== jsAt && i !== jsAt + 1));
  return rest.length === 1 ? { source: rest[0], js } : null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exit(1);
  }

  const started = performance.now();
  try {
    const song = await prepareSong({
      sourcePath: path.resolve(args.source),
      storageRoot: storageRoot(process.cwd()),
      projectRoot: process.cwd(),
      platform: process.platform,
      run: runCommand,
    });
    const analysis: unknown = JSON.parse(readFileSync(song.analysisPath, "utf8"));
    if (!isCurrentAnalysis(analysis)) throw new Error("analysis.json is not a current analysis");
    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    console.log(`${song.cached ? "cached" : "analyzed"} in ${seconds} s`);
    console.log(`song id   ${song.songId}`);
    console.log(`duration  ${formatDuration(song.duration)}`);
    console.log(`frames    ${analysis.frames.length}`);
    console.log(`hits      ${analysis.hits.length}`);
    console.log(`folder    ${song.dir}`);

    if (args.js) {
      writeFileSync(args.js, toAudioDataJs(analysis));
      console.log(`wrote     ${path.resolve(args.js)}`);
    }
  } catch (error) {
    console.error(error instanceof SongError ? error.message : String(error));
    process.exit(1);
  }
}

void main();
