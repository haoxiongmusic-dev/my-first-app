/**
 * Saving an uploaded song to disk. The browser sends the file as the raw request body; it is
 * streamed straight to a file (never held in memory) and stopped as soon as it passes the
 * size limit, so a 1 GB album never fills the server's memory.
 */
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { SongError, TOO_BIG_MESSAGE, UNREADABLE_MESSAGE } from "@/lib/songs";

/** What kind of file an upload must be, and the errors to give otherwise. */
export type UploadKind = {
  extensions: string[];
  unreadable: () => Error;
  tooBig: () => Error;
  /** the upload arrived shorter than the browser said it was */
  incomplete: () => Error;
};

export const INCOMPLETE_UPLOAD_MESSAGE = "The upload didn't arrive in full: please try again.";

export const SONG_UPLOAD: UploadKind = {
  extensions: [".wav", ".mp3", ".flac", ".m4a"],
  unreadable: () => new SongError("unreadable", UNREADABLE_MESSAGE),
  tooBig: () => new SongError("too-big", TOO_BIG_MESSAGE),
  incomplete: () => new SongError("unreadable", INCOMPLETE_UPLOAD_MESSAGE),
};

/** The size the browser said it is sending (Content-Length), if it said. */
export function expectedBytes(request: Request): number | undefined {
  const n = Number(request.headers.get("content-length"));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Stream an upload into `dir` as `<random id><extension>`; returns the file's path. */
export async function saveUpload(
  body: ReadableStream<Uint8Array>,
  dir: string,
  fileName: string,
  maxBytes: number,
  kind: UploadKind = SONG_UPLOAD,
  /** when known, the upload must be exactly this long (a cut-short body is refused) */
  expectedBytes?: number,
): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  if (!kind.extensions.includes(ext)) throw kind.unreadable();

  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${randomUUID()}${ext}`);
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > maxBytes) done(kind.tooBig());
      else done(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as WebReadableStream<Uint8Array>),
      limit,
      createWriteStream(target),
    );
    if (expectedBytes !== undefined && received !== expectedBytes) throw kind.incomplete();
    return target;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
