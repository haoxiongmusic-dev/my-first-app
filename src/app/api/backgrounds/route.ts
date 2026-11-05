// PUT /api/backgrounds: upload a background image (raw body, name in `x-file-name`). It is
// converted once to a 1920×1080 JPEG and kept by fingerprint; the reply gives its id.
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  saveBackground,
  TOO_BIG_IMAGE_MESSAGE,
} from "@/lib/backgrounds";
import { JobError, UNREADABLE_IMAGE_MESSAGE } from "@/lib/jobs";
import { runCommand } from "@/lib/run-command";
import { saveUpload, type UploadKind } from "@/lib/uploads";

class TooBig extends Error {}

const IMAGE_UPLOAD: UploadKind = {
  extensions: IMAGE_EXTENSIONS,
  unreadable: () => new JobError(UNREADABLE_IMAGE_MESSAGE),
  tooBig: () => new TooBig(TOO_BIG_IMAGE_MESSAGE),
};

export async function PUT(request: Request): Promise<Response> {
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
  const storageRoot = path.join(process.cwd(), "storage");
  let upload: string | undefined;
  try {
    upload = await saveUpload(
      request.body,
      path.join(storageRoot, "uploads"),
      name,
      MAX_IMAGE_BYTES,
      IMAGE_UPLOAD,
    );
    return Response.json({ backgroundId: await saveBackground(upload, storageRoot, runCommand) });
  } catch (error) {
    if (error instanceof TooBig) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof JobError) return Response.json({ error: error.message }, { status: 422 });
    console.error("Background upload failed:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Something went wrong: ${detail}` }, { status: 500 });
  } finally {
    if (upload) await rm(upload, { force: true });
  }
}
