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

const SONG_EXTENSIONS = [".wav", ".mp3", ".flac", ".m4a"];

/** Stream an upload into `dir` as `<random id><extension>`; returns the file's path. */
export async function saveUpload(
  body: ReadableStream<Uint8Array>,
  dir: string,
  fileName: string,
  maxBytes: number,
): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  if (!SONG_EXTENSIONS.includes(ext)) throw new SongError("unreadable", UNREADABLE_MESSAGE);

  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${randomUUID()}${ext}`);
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > maxBytes) done(new SongError("too-big", TOO_BIG_MESSAGE));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as WebReadableStream<Uint8Array>),
      limit,
      createWriteStream(target),
    );
    return target;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
