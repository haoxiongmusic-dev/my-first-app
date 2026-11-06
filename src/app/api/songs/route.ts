// PUT /api/songs: upload a song (the file is the raw request body; its name is in the
// `x-file-name` header). The song is converted and analyzed once, then cached by fingerprint.
import { rm } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "@/lib/run-command";
import {
  MAX_SONG_BYTES,
  MAX_SONG_SECONDS,
  prepareSong,
  SongError,
  type SongErrorKind,
  songInfo,
  TOO_BIG_MESSAGE,
  UNREADABLE_MESSAGE,
} from "@/lib/songs";
import { expectedBytes, saveUpload, SONG_UPLOAD } from "@/lib/uploads";
import { requireLogin } from "@/lib/auth/require-login";
import { storageRoot as storageRootOf } from "@/lib/storage-root";

const STATUS: Record<SongErrorKind, number> = {
  unreadable: 422,
  "too-short": 422,
  "too-long": 413,
  "too-big": 413,
  "analyzer-failed": 500,
};

function fileNameFrom(request: Request): string {
  try {
    return decodeURIComponent(request.headers.get("x-file-name") ?? "");
  } catch {
    return "";
  }
}

export async function PUT(request: Request): Promise<Response> {
  // The proxy leaves upload routes alone (it would cut bodies at 10 MB): check the login here.
  const denied = requireLogin(request);
  if (denied) return denied;
  if (!request.body) return Response.json({ error: UNREADABLE_MESSAGE }, { status: 422 });
  if (Number(request.headers.get("content-length")) > MAX_SONG_BYTES) {
    return Response.json({ error: TOO_BIG_MESSAGE }, { status: 413 });
  }

  const root = process.cwd();
  const storageRoot = storageRootOf(root);
  let upload: string | undefined;
  try {
    upload = await saveUpload(
      request.body,
      path.join(storageRoot, "uploads"),
      fileNameFrom(request),
      MAX_SONG_BYTES,
      SONG_UPLOAD,
      expectedBytes(request),
    );
    const song = await prepareSong({
      sourcePath: upload,
      storageRoot,
      projectRoot: root,
      platform: process.platform,
      run: runCommand,
      maxSeconds: MAX_SONG_SECONDS,
    });
    const info = await songInfo(storageRoot, song.songId);
    if (!info) throw new Error("the analysis could not be read back");
    return Response.json({ ...info, cached: song.cached });
  } catch (error) {
    if (error instanceof SongError) {
      return Response.json({ error: error.message }, { status: STATUS[error.kind] });
    }
    console.error("Song upload failed:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Something went wrong: ${detail}` }, { status: 500 });
  } finally {
    // The converted copy in storage/songs/ is what's kept; the raw upload isn't needed.
    if (upload) await rm(upload, { force: true });
  }
}
