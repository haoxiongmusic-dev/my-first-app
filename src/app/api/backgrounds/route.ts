// PUT /api/backgrounds: upload a background image (raw body, name in `x-file-name`). It is
// converted once to a 1920×1080 JPEG and kept by fingerprint; the reply gives its id.
import { rm } from "node:fs/promises";
import path from "node:path";
import { MAX_IMAGE_BYTES, saveBackground, TOO_BIG_IMAGE_MESSAGE } from "@/lib/backgrounds";
import { IMAGE_UPLOAD, ImageTooBig } from "@/lib/images";
import { JobError, UNREADABLE_IMAGE_MESSAGE } from "@/lib/jobs";
import { runCommand } from "@/lib/run-command";
import { expectedBytes, saveUpload } from "@/lib/uploads";
import { requireLogin } from "@/lib/auth/require-login";
import { storageRoot as storageRootOf } from "@/lib/storage-root";

export async function PUT(request: Request): Promise<Response> {
  // The proxy leaves upload routes alone (it would cut bodies at 10 MB): check the login here.
  const denied = requireLogin(request);
  if (denied) return denied;
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
  const storageRoot = storageRootOf(process.cwd());
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
    return Response.json({ backgroundId: await saveBackground(upload, storageRoot, runCommand) });
  } catch (error) {
    if (error instanceof ImageTooBig)
      return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof JobError) return Response.json({ error: error.message }, { status: 422 });
    console.error("Background upload failed:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Something went wrong: ${detail}` }, { status: 500 });
  } finally {
    if (upload) await rm(upload, { force: true });
  }
}
