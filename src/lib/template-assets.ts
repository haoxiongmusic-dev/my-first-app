/**
 * Each template folder needs a song in its fixed asset paths (assets/song.wav and
 * assets/audio-data.js) so HyperFrames can check, preview and snapshot it in place. These are
 * made from the generated sample song and are git-ignored, so the repo never holds music.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCurrentAnalysis, toAudioDataJs } from "@/lib/analysis";
import { venvPythonPath } from "@/lib/python";
import type { RunCommand } from "@/lib/run-command";
import { prepareSong } from "@/lib/songs";
import { listTemplates } from "@/lib/templates";
import { syncToolkit } from "@/lib/toolkit-sync";
import { storageRoot } from "@/lib/storage-root";

async function sameContent(file: string, content: Buffer | string): Promise<boolean> {
  if (!existsSync(file)) return false;
  const current = await readFile(file);
  return current.equals(typeof content === "string" ? Buffer.from(content) : content);
}

/**
 * Make the sample song (and its analysis), put it into every template's assets folder and
 * bring the toolkit copies up to date. Returns the files it changed.
 */
export async function ensureTemplateAssets(
  projectRoot: string,
  run: RunCommand,
): Promise<string[]> {
  const sampleDir = path.join(storageRoot(projectRoot), "sample");
  const samplePath = path.join(sampleDir, "sample-song.wav");
  await mkdir(sampleDir, { recursive: true });
  const python = venvPythonPath(projectRoot, process.platform);
  const made = await run(python, [
    path.join(projectRoot, "analyzer", "sample_song.py"),
    "--out",
    samplePath,
  ]);
  if (made.code !== 0) throw new Error(`Couldn't make the sample song: ${made.stderr.trim()}`);

  const song = await prepareSong({
    sourcePath: samplePath,
    storageRoot: storageRoot(projectRoot),
    projectRoot,
    platform: process.platform,
    run,
  });
  const analysis: unknown = JSON.parse(await readFile(song.analysisPath, "utf8"));
  if (!isCurrentAnalysis(analysis)) throw new Error("The sample song's analysis is out of date");
  const wav = await readFile(song.wavPath);
  const data = toAudioDataJs(analysis);

  const templatesRoot = path.join(projectRoot, "templates");
  const changed: string[] = [];
  for (const template of await listTemplates(templatesRoot)) {
    const assets = path.join(template.dir, "assets");
    await mkdir(assets, { recursive: true });
    const wavPath = path.join(assets, "song.wav");
    const dataPath = path.join(assets, "audio-data.js");
    if (!(await sameContent(wavPath, wav))) {
      await copyFile(song.wavPath, wavPath);
      changed.push(wavPath);
    }
    if (!(await sameContent(dataPath, data))) {
      await writeFile(dataPath, data);
      changed.push(dataPath);
    }
  }
  changed.push(...(await syncToolkit(templatesRoot)));
  return changed;
}
