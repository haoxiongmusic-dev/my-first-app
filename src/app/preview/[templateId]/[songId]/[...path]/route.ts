// Serves a template's live preview for one song (see src/lib/preview.ts).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { parseRange, resolvePreviewFile } from "@/lib/preview";
import { sampleSongId } from "@/lib/sample-song-id";

type Params = { templateId: string; songId: string; path: string[] };

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> },
): Promise<Response> {
  const { templateId, songId, path: filePath } = await params;
  const root = process.cwd();
  const file = await resolvePreviewFile({
    templatesRoot: path.join(root, "templates"),
    storageRoot: path.join(root, "storage"),
    templateId,
    songId,
    path: filePath,
    resolveSample: () => sampleSongId(root),
  });
  if (!file) return new Response("Not found", { status: 404 });

  if (file.kind !== "file") {
    const type =
      file.kind === "html" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8";
    return new Response(file.body, {
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
    });
  }

  const size = (await stat(file.path)).size;
  const range = parseRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  // Streamed in pieces: an hour-long WAV is about 600 MB.
  const body = Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream;
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}
