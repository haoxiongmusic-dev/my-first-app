// `npm run thumbs -- <template> [--song <file>] [--at <seconds>]`: make a thumbnail of every
// preset (templates/<id>/presets/<name>.jpg, 480×270) and a sheet of them all in
// test-renders/<id>-presets.jpg. Uses the generated sample song unless --song is given.
// Thumbnails are still images (no audio), so they may be committed.
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prepareJob } from "../src/lib/jobs";
import { runCommand } from "../src/lib/run-command";
import { SAMPLE_SONG } from "../src/lib/sample-song";
import { prepareSong } from "../src/lib/songs";
import { ensureTemplateAssets } from "../src/lib/template-assets";
import { loadTemplate, resolveValues } from "../src/lib/templates";

const USAGE = "Usage: npm run thumbs -- <template> [--song <file>] [--at <seconds>]";

async function run(cmd: string, args: string[]): Promise<void> {
  const result = await runCommand(cmd, args);
  if (result.code !== 0) throw new Error(`${cmd} failed: ${result.stderr.trim().slice(-600)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const option = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const id = argv[0];
  if (!id || id.startsWith("--")) throw new Error(USAGE);
  const at = Number(option("--at") ?? SAMPLE_SONG.loudAt);
  if (!Number.isFinite(at) || at < 0) throw new Error(USAGE);

  const root = process.cwd();
  await ensureTemplateAssets(root, runCommand);
  const template = await loadTemplate(path.join(root, "templates", id));
  const songFile = option("--song") ?? path.join(root, "storage", "sample", "sample-song.wav");
  const song = await prepareSong({
    sourcePath: path.resolve(songFile),
    storageRoot: path.join(root, "storage"),
    projectRoot: root,
    platform: process.platform,
    run: runCommand,
  });

  const work = path.join(root, "storage", "jobs", `thumbs-${id}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(path.join(template.dir, "presets"), { recursive: true });
  const presets = template.manifest.presets;
  const thumbs: string[] = [];

  // Three presets at a time: each snapshot starts its own browser.
  for (let i = 0; i < presets.length; i += 3) {
    await Promise.all(
      presets.slice(i, i + 3).map(async (preset, j) => {
        const jobDir = path.join(work, String(i + j));
        const values = resolveValues(template, { preset: preset.name });
        // Only the part of the song around the moment is needed for a still.
        const section = { start: Math.max(0, at - 1), end: at + 1 };
        await prepareJob({ template, song, values, jobDir, section, run: runCommand });
        const snapDir = path.join(jobDir, "snap");
        const local = at - section.start;
        await run("npx", [
          ...["hyperframes", "snapshot", `"${jobDir}"`, "--at", String(local), "--no-end"],
          ...["--json", "-o", `"${snapDir}"`],
        ]);
        const still = path.join(snapDir, `frame-00-at-${local}s.png`);
        const thumb = path.join(template.dir, preset.thumbnail ?? `presets/${preset.name}.jpg`);
        await run("ffmpeg", [
          "-y",
          "-v",
          "error",
          "-i",
          still,
          "-vf",
          "scale=480:270",
          "-q:v",
          "3",
          thumb,
        ]);
        thumbs[i + j] = thumb;
        console.log(`${preset.name}: ${path.relative(root, thumb)}`);
      }),
    );
  }

  if (thumbs.length > 0) {
    const sheet = path.join(root, "test-renders", `${id}-presets.jpg`);
    await mkdir(path.dirname(sheet), { recursive: true });
    const layout = thumbs.map((_, i) => `${(i % 3) * 480}_${Math.floor(i / 3) * 270}`).join("|");
    await run("ffmpeg", [
      ...["-y", "-v", "error", ...thumbs.flatMap((t) => ["-i", t])],
      ...["-filter_complex", `xstack=inputs=${thumbs.length}:layout=${layout}:fill=black`],
      ...["-frames:v", "1", sheet],
    ]);
    console.log(`sheet: ${path.relative(root, sheet)}`);
  }
  await rm(work, { recursive: true, force: true });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
