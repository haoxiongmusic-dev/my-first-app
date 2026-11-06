// GET /api/health: how this server renders (the start-up GPU check), where it keeps files and
// how much space is left. Behind the login like everything else.
import { getExportManager } from "@/lib/exports/manager";
import { getGpuStatus } from "@/lib/gpu-check";
import { storageRoot } from "@/lib/storage-root";

export async function GET(): Promise<Response> {
  const { gpu, seconds } = getGpuStatus();
  const freeBytes = await getExportManager().freeBytes();
  return Response.json({ gpu, seconds, storage: storageRoot(), freeBytes });
}
