/**
 * Turning a render's progress into what the owner sees: one percentage for the whole export,
 * time remaining, and an estimate before it starts. Safe to use in the browser.
 */

export type Quality = "draft" | "final";
export type Resolution = "1080p" | "1440p";
export type HfProgress = { code: string; pct: number; done?: number; total?: number };

const HF_PREFIX = "@hf-progress ";

/** A HyperFrames progress line ("@hf-progress {...}"), or null for any other output. */
export function parseHfProgress(line: string): HfProgress | null {
  const at = line.indexOf(HF_PREFIX);
  if (at < 0) return null;
  try {
    const value: unknown = JSON.parse(line.slice(at + HF_PREFIX.length));
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<HfProgress>;
    if (typeof p.code !== "string" || typeof p.pct !== "number") return null;
    return p as HfProgress;
  } catch {
    return null;
  }
}

/** Seconds encoded so far, from FFmpeg's "-progress" output ("out_time_us=…"). */
export function parseFfmpegProgressSeconds(line: string): number | null {
  const match = /^out_time_us=(\d+)$/.exec(line.trim());
  return match ? Number(match[1]) / 1e6 : null;
}

/** The whole export's percentage: preparing 0–2, rendering 2–90, encoding 90–100. */
export function overallPercent(
  stage: "preparing" | "rendering" | "encoding",
  stagePct: number,
): number {
  const p = Math.min(100, Math.max(0, stagePct)) / 100;
  const value = stage === "preparing" ? p * 2 : stage === "rendering" ? 2 + p * 88 : 90 + p * 10;
  return Math.round(value * 10) / 10;
}

/** Seconds an export will take on this PC (measured: a 4:12 song took 17 min at Final). */
export function estimateExportSeconds(
  seconds: number,
  quality: Quality,
  resolution: Resolution,
): number {
  const perSecond = quality === "final" ? 4.0 : 3.0;
  const scale = resolution === "1440p" ? 1.1 : 1;
  return Math.round(60 + seconds * perSecond * scale);
}

/**
 * Seconds left. Until the render has captured 20 frames, its speed isn't known yet, so this
 * counts down the estimate; after that it uses the measured rate.
 */
export function remainingSeconds(o: {
  elapsed: number;
  percent: number;
  estimate: number;
  framesCaptured: number;
}): number {
  if (o.framesCaptured < 20 || o.percent <= 0)
    return Math.max(0, Math.round(o.estimate - o.elapsed));
  return Math.max(0, Math.round((o.elapsed / o.percent) * (100 - o.percent)));
}

/** 1068 → "about 18 min"; 14460 → "about 4 h 1 min" */
export function formatEstimate(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `about ${m} min`;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}
