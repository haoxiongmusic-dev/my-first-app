// GET /api/songs/<id>: a cached song's length and waveform.
import { songInfo } from "@/lib/songs";
import { storageRoot } from "@/lib/storage-root";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const info = await songInfo(storageRoot(process.cwd()), id);
  return info ? Response.json(info) : Response.json({ error: "Song not found" }, { status: 404 });
}
