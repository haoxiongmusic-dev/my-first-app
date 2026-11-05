/**
 * Text and decisions for the Export panel. Safe in the browser (types only from the server).
 */
import { formatClock } from "@/lib/editor-state";
import type { ExportStatus } from "@/lib/exports/manager";
import {
  estimateExportSeconds,
  formatEstimate,
  type Quality,
  type Resolution,
} from "@/lib/exports/progress";

/** "1080p · 30 fps · 4:12 · about 18 min" */
export function exportSummary(o: {
  seconds: number;
  resolution: Resolution;
  quality: Quality;
}): string {
  const size =
    o.quality === "draft" ? "720p draft" : o.resolution === "1440p" ? "1440p (upscaled)" : "1080p";
  const time = formatEstimate(estimateExportSeconds(o.seconds, o.quality, o.resolution));
  return `${size} · 30 fps · ${formatClock(o.seconds)} · ${time}`;
}

/** Notify once, when an export we watched running has just finished or failed. */
export function shouldNotify(previous: ExportStatus | null, next: ExportStatus): boolean {
  return previous?.state === "running" && (next.state === "done" || next.state === "failed");
}

function elapsedText(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

/** "Exporting 42 % · 3 min elapsed · about 14 min left", "Done", "Export failed: …", "Cancelled" */
export function progressText(s: ExportStatus): string {
  switch (s.state) {
    case "running": {
      const left =
        s.remainingSeconds === null ? "" : ` · ${formatEstimate(s.remainingSeconds)} left`;
      return `Exporting ${Math.floor(s.percent)} % · ${elapsedText(s.elapsedSeconds)} elapsed${left}`;
    }
    case "done":
      return "Done";
    case "failed":
      return `Export failed: ${s.error ?? "unknown problem"}`;
    case "cancelled":
      return "Cancelled";
  }
}
