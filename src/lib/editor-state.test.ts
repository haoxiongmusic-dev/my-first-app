import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFERENCES,
  formatClock,
  latestThrottle,
  loadPreferences,
  PREVIEW_RESOLUTIONS,
  previewSrc,
  previewValues,
  songRequestGate,
} from "@/lib/editor-state";
import type { TemplateVariable } from "@/lib/template-values";

describe("editor state", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("previewSrc uses the sample song until one is chosen", () => {
    expect(previewSrc("particle-horizon", null)).toBe(
      "/preview/particle-horizon/sample/index.html",
    );
    expect(previewSrc("particle-horizon", "ab12")).toBe(
      "/preview/particle-horizon/ab12/index.html",
    );
    expect(previewSrc("particle-horizon", null, "ff")).toBe(
      "/preview/particle-horizon/sample~ff/index.html",
    );
  });

  it("latestThrottle sends at once, then at most every 100 ms, ending on the newest value", () => {
    const sent: number[] = [];
    const t = latestThrottle<number>((v) => sent.push(v), 100);
    t.push(1);
    vi.advanceTimersByTime(20);
    t.push(2);
    vi.advanceTimersByTime(20);
    t.push(3);
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(60);
    expect(sent).toEqual([1, 3]);
    vi.advanceTimersByTime(500);
    expect(sent).toEqual([1, 3]);
    t.push(4);
    expect(sent).toEqual([1, 3, 4]);
  });

  it("latestThrottle flush sends a waiting value now", () => {
    const sent: number[] = [];
    const t = latestThrottle<number>((v) => sent.push(v), 100);
    t.push(1);
    t.push(2);
    t.flush();
    expect(sent).toEqual([1, 2]);
    vi.advanceTimersByTime(200);
    expect(sent).toEqual([1, 2]);
  });

  it("songRequestGate ignores stale responses", () => {
    const gate = songRequestGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("formatClock shows minutes and seconds, and hours when needed", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("preferences", () => {
  it("loadPreferences falls back to defaults", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ previewResolution: "540p", expandedSidebar: false });
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences("{bad")).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences('{"previewResolution":"4k"}')).toEqual(DEFAULT_PREFERENCES);
    const saved = { previewResolution: "360p", expandedSidebar: true };
    expect(loadPreferences(JSON.stringify(saved))).toEqual(saved);
  });

  it("offers 360p, 540p and 720p", () => {
    expect(PREVIEW_RESOLUTIONS.map((r) => [r.label, r.scale])).toEqual([
      ["360p", 1 / 3],
      ["540p", 0.5],
      ["720p", 2 / 3],
    ]);
  });
});

describe("previewValues", () => {
  const ID = "f".repeat(64);
  const vars: TemplateVariable[] = [
    { id: "title", type: "string", label: "Title", default: "" },
    { id: "cover", type: "image", label: "Cover art", default: "", fit: "square" },
  ];

  it("turns image ids into preview picture locations and leaves the rest alone", () => {
    expect(previewValues(vars, { title: "T", cover: ID })).toEqual({
      title: "T",
      cover: `/api/images/${ID}/square.jpg`,
    });
    expect(previewValues(vars, { title: "T", cover: "" })).toEqual({ title: "T", cover: "" });
  });
});
