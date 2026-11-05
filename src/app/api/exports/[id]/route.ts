// GET /api/exports/<id>: an export's status. DELETE: cancel it.
import { getExportManager } from "@/lib/exports/manager";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const status = await getExportManager().get((await params).id);
  return status
    ? Response.json(status)
    : Response.json({ error: "Export not found" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const status = await getExportManager().cancel((await params).id);
  return status
    ? Response.json(status)
    : Response.json({ error: "Export not found" }, { status: 404 });
}
