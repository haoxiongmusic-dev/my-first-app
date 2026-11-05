// POST /api/exports: start an export (one at a time). GET /api/exports: the running export and
// how much disk space is free.
import { ExportBusy, ExportInvalid, getExportManager, LOW_DISK_BYTES } from "@/lib/exports/manager";
import type { ExportRequest } from "@/lib/exports/run-export";

function asRequest(body: unknown): ExportRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const optionalNumber = (v: unknown) => v === undefined || typeof v === "number";
  if (
    typeof b.templateId !== "string" ||
    typeof b.songId !== "string" ||
    typeof b.values !== "object" ||
    b.values === null ||
    !optionalNumber(b.start) ||
    !optionalNumber(b.end) ||
    (b.backgroundId !== undefined && typeof b.backgroundId !== "string")
  ) {
    return null;
  }
  return b as unknown as ExportRequest;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The export request couldn't be read." }, { status: 400 });
  }
  const exportRequest = asRequest(body);
  if (!exportRequest) {
    return Response.json({ error: "The export request is incomplete." }, { status: 400 });
  }
  try {
    return Response.json(await getExportManager().start(exportRequest), { status: 202 });
  } catch (error) {
    if (error instanceof ExportBusy)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof ExportInvalid)
      return Response.json({ error: error.message }, { status: 400 });
    console.error("Export failed to start:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `The export couldn't start: ${detail}` }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  const manager = getExportManager();
  const freeBytes = await manager.freeBytes();
  const current = manager.current();
  // The most recent export too, so the panel can show one that failed or was cut off by a restart.
  const latest = current ?? (await manager.latest());
  return Response.json({ current, latest, freeBytes, lowDisk: freeBytes < LOW_DISK_BYTES });
}
