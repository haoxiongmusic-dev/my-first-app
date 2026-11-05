/**
 * Background images (Content tab → Background image). Each picked image is converted once to a
 * 1920×1080 JPEG that fills the frame (cropped, never stretched; transparent parts on black)
 * and kept in storage/backgrounds/<fingerprint>.jpg for the preview and exports.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { JobError, UNREADABLE_IMAGE_MESSAGE } from "@/lib/jobs";
import type { RunCommand } from "@/lib/run-command";
import { songIdFor } from "@/lib/songs";

// The picture limits are shared with image settings (images.ts owns them).
export { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, TOO_BIG_IMAGE_MESSAGE } from "@/lib/images";

/** FFmpeg arguments: cover 1920×1080 (crop the overflow), on black, one JPEG frame. */
export function backgroundArgs(input: string, output: string): string[] {
  return [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=black:s=1920x1080", "-i", input],
    ...[
      "-filter_complex",
      "[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080[fg];" +
        "[0:v][fg]overlay=shortest=1",
    ],
    ...["-frames:v", "1", "-q:v", "2", output],
  ];
}

/** Convert and keep an image; returns its id (the SHA-256 fingerprint of the original file). */
export async function saveBackground(
  source: string,
  storageRoot: string,
  run: RunCommand,
): Promise<string> {
  const id = await songIdFor(source); // the same streamed fingerprint songs use
  const dir = path.join(storageRoot, "backgrounds");
  const target = path.join(dir, `${id}.jpg`);
  if (existsSync(target)) return id;
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `${id}.${randomUUID()}.tmp.jpg`);
  try {
    const result = await run("ffmpeg", backgroundArgs(source, temp));
    if (result.code !== 0 || !existsSync(temp)) throw new JobError(UNREADABLE_IMAGE_MESSAGE);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
  return id;
}
