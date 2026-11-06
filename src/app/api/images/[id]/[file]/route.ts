// GET /api/images/<id>/<fit>.jpg: a stored picture, for the editor's live preview.
import { imageFileResponse } from "@/lib/images";
import { storageRoot } from "@/lib/storage-root";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
): Promise<Response> {
  const { id, file } = await params;
  return imageFileResponse(storageRoot(process.cwd()), id, file);
}
