import { describe, expect, it } from "vitest";
import { exportSummary, progressText, shouldNotify } from "@/lib/export-client";
import type { ExportStatus } from "@/lib/exports/manager";

function status(overrides: Partial<ExportStatus> = {}): ExportStatus {
  return {
    exportId: "20261105-120000-abcd",
    state: "running",
    stage: "rendering",
    percent: 42,
    elapsedSeconds: 180,
    remainingSeconds: 840,
    estimateSeconds: 1068,
    fileName: null,
    error: null,
    logTail: [],
    startedAt: "2026-11-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("export panel text", () => {
  it("exportSummary describes the export", () => {
    expect(exportSummary({ seconds: 252, resolution: "1080p", quality: "final" })).toBe(
      "1080p · 30 fps · 4:12 · about 21 min",
    );
    expect(exportSummary({ seconds: 252, resolution: "1080p", quality: "draft" })).toMatch(
      /^720p draft · 30 fps · 4:12 · about 14 min$/,
    );
    expect(exportSummary({ seconds: 252, resolution: "1440p", quality: "final" })).toContain(
      "1440p (upscaled)",
    );
  });

  it("shouldNotify fires once when an export finishes or fails", () => {
    const running = status();
    expect(shouldNotify(null, running)).toBe(false);
    expect(shouldNotify(running, status({ percent: 50 }))).toBe(false);
    expect(shouldNotify(running, status({ state: "done" }))).toBe(true);
    expect(shouldNotify(running, status({ state: "failed" }))).toBe(true);
    expect(shouldNotify(running, status({ state: "cancelled" }))).toBe(false);
    expect(shouldNotify(status({ state: "done" }), status({ state: "done" }))).toBe(false);
    expect(shouldNotify(null, status({ state: "done" }))).toBe(false); // already done when we looked
  });

  it("progressText for each state", () => {
    expect(progressText(status())).toBe("Exporting 42 % · 3 min elapsed · about 14 min left");
    expect(progressText(status({ elapsedSeconds: 20, remainingSeconds: 30 }))).toBe(
      "Exporting 42 % · less than a minute elapsed · less than a minute left",
    );
    expect(progressText(status({ state: "done" }))).toBe("Done");
    expect(progressText(status({ state: "failed", error: "The render failed." }))).toBe(
      "Export failed: The render failed.",
    );
    expect(progressText(status({ state: "cancelled" }))).toBe("Cancelled");
  });
});
