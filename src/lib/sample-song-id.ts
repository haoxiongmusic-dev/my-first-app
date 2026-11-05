/**
 * The generated sample song as a cached song (storage/songs/<fingerprint>/), made on first use,
 * so the editor can show a preview before the owner uploads anything.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { runCommand } from "@/lib/run-command";
import { prepareSong } from "@/lib/songs";
import { ensureTemplateAssets } from "@/lib/template-assets";

let pending: Promise<string | null> | null = null;

export function sampleSongId(projectRoot: string): Promise<string | null> {
  pending ??= (async () => {
    const samplePath = path.join(projectRoot, "storage", "sample", "sample-song.wav");
    if (!existsSync(samplePath)) await ensureTemplateAssets(projectRoot, runCommand);
    const song = await prepareSong({
      sourcePath: samplePath,
      storageRoot: path.join(projectRoot, "storage"),
      projectRoot,
      platform: process.platform,
      run: runCommand,
    });
    return song.songId;
  })().catch((error: unknown) => {
    pending = null; // try again next time
    console.error("Couldn't prepare the sample song:", error);
    return null;
  });
  return pending;
}
