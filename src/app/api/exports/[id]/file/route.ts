// GET /api/exports/<id>/file: download the finished MP4.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getExportManager } from "@/lib/exports/manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const file = await getExportManager().filePath((await params).id);
  if (!file) return Response.json({ error: "Export not found" }, { status: 404 });
  const size = (await stat(file)).size;
  const name = path.basename(file);
  // A plain-ASCII fallback name for old browsers; filename* carries the real (Unicode) name.
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
