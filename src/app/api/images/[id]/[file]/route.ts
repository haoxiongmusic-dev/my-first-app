// GET /api/images/<id>/<fit>.jpg: a stored picture, for the editor's live preview.
import path from "node:path";
import { imageFileResponse } from "@/lib/images";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
): Promise<Response> {
  const { id, file } = await params;
  return imageFileResponse(path.join(process.cwd(), "storage"), id, file);
}
