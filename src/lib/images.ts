/**
 * Pictures for a template's image settings (for example the cover art). Each upload is
 * converted once per fit and kept in storage/images/<fingerprint>-<fit>.jpg. The editor shows
 * it through GET /api/images/<id>/<fit>.jpg; an export copies it into the job folder.
 *
 * The one fit so far, "square": 1024×1024, scaled to cover and cropped from the centre (never
 * stretched), transparent parts on black.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { JobError, UNREADABLE_IMAGE_MESSAGE } from "@/lib/jobs";
import type { RunCommand } from "@/lib/run-command";
import { songIdFor } from "@/lib/songs";
import { IMAGE_FITS, IMAGE_ID, type ImageFit } from "@/lib/template-values";
import {
  expectedBytes,
  INCOMPLETE_UPLOAD_MESSAGE,
  saveUpload,
  type UploadKind,
} from "@/lib/uploads";

export const TOO_BIG_IMAGE_MESSAGE = "Images can be up to 50 MB.";
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const IMAGE_MISSING_MESSAGE = "This image is no longer available: please upload it again.";
export const UNKNOWN_FIT_MESSAGE = "Unknown image fit.";

const FIT_SIZE: Record<ImageFit, number> = { square: 1024 };

/** An upload that passed the size limit. */
export class ImageTooBig extends Error {}

/** The file types a picture upload accepts, and the errors otherwise. */
export const IMAGE_UPLOAD: UploadKind = {
  extensions: IMAGE_EXTENSIONS,
  unreadable: () => new JobError(UNREADABLE_IMAGE_MESSAGE),
  tooBig: () => new ImageTooBig(TOO_BIG_IMAGE_MESSAGE),
  incomplete: () => new JobError(INCOMPLETE_UPLOAD_MESSAGE),
};

/** FFmpeg arguments: cover the fit's size (crop the overflow), on black, one JPEG frame. */
export function imageArgs(input: string, output: string, fit: ImageFit): string[] {
  const s = FIT_SIZE[fit];
  return [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", `color=black:s=${s}x${s}`, "-i", input],
    ...[
      "-filter_complex",
      `[1:v]scale=${s}:${s}:force_original_aspect_ratio=increase,crop=${s}:${s}[fg];` +
        "[0:v][fg]overlay=shortest=1",
    ],
    ...["-frames:v", "1", "-q:v", "2", output],
  ];
}

/** Where a converted picture is kept. */
export function imagePath(storageRoot: string, id: string, fit: ImageFit): string {
  return path.join(storageRoot, "images", `${id}-${fit}.jpg`);
}

/** Convert and keep a picture; returns its id (the SHA-256 fingerprint of the original file). */
export async function saveImage(
  source: string,
  storageRoot: string,
  run: RunCommand,
  fit: ImageFit,
): Promise<string> {
  const id = await songIdFor(source); // the same streamed fingerprint songs and backgrounds use
  const target = imagePath(storageRoot, id, fit);
  if (existsSync(target)) return id;
  const dir = path.dirname(target);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `${id}-${fit}.${randomUUID()}.tmp.jpg`);
  try {
    const result = await run("ffmpeg", imageArgs(source, temp, fit));
    if (result.code !== 0 || !existsSync(temp)) throw new JobError(UNREADABLE_IMAGE_MESSAGE);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
  return id;
}

function isFit(value: string | null): value is ImageFit {
  return value !== null && (IMAGE_FITS as readonly string[]).includes(value);
}

/** PUT /api/images?fit=<fit>: the raw file as the body, its name in `x-file-name`. */
export async function uploadImageResponse(
  request: Request,
  storageRoot: string,
  run: RunCommand,
): Promise<Response> {
  const fit = new URL(request.url).searchParams.get("fit");
  if (!isFit(fit)) return Response.json({ error: UNKNOWN_FIT_MESSAGE }, { status: 400 });
  if (!request.body) return Response.json({ error: UNREADABLE_IMAGE_MESSAGE }, { status: 422 });
  if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) {
    return Response.json({ error: TOO_BIG_IMAGE_MESSAGE }, { status: 413 });
  }
  let name = "";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
  } catch {
    // an unreadable name is treated like an unknown file type below
  }
  let upload: string | undefined;
  try {
    upload = await saveUpload(
      request.body,
      path.join(storageRoot, "uploads"),
      name,
      MAX_IMAGE_BYTES,
      IMAGE_UPLOAD,
      expectedBytes(request),
    );
    return Response.json({ id: await saveImage(upload, storageRoot, run, fit) });
  } catch (error) {
    if (error instanceof ImageTooBig) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof JobError) return Response.json({ error: error.message }, { status: 422 });
    console.error("Image upload failed:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Something went wrong: ${detail}` }, { status: 500 });
  } finally {
    if (upload) await rm(upload, { force: true });
  }
}

/** GET /api/images/<id>/<fit>.jpg. The id is checked before any path is built from it. */
export async function imageFileResponse(
  storageRoot: string,
  id: string,
  file: string,
): Promise<Response> {
  if (!IMAGE_ID.test(id)) return Response.json({ error: "Bad image id." }, { status: 400 });
  const fit = file.endsWith(".jpg") ? file.slice(0, -".jpg".length) : null;
  const stored = isFit(fit) ? imagePath(storageRoot, id, fit) : null;
  if (!stored || !existsSync(stored)) {
    return Response.json({ error: "No such image." }, { status: 404 });
  }
  return new Response(new Uint8Array(await readFile(stored)), {
    headers: {
      "Content-Type": "image/jpeg",
      // The address is the file's fingerprint, so what it serves never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
