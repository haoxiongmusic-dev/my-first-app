// GET /api/songs/<id>: a cached song's length and waveform.
import path from "node:path";
import { songInfo } from "@/lib/songs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const info = await songInfo(path.join(process.cwd(), "storage"), id);
  return info ? Response.json(info) : Response.json({ error: "Song not found" }, { status: 404 });
}
