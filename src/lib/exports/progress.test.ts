import { describe, expect, it } from "vitest";
import {
  estimateExportSeconds,
  formatEstimate,
  overallPercent,
  parseFfmpegProgressSeconds,
  parseHfProgress,
  remainingSeconds,
} from "@/lib/exports/progress";

describe("export progress", () => {
  it("parseHfProgress reads progress lines", () => {
    expect(
      parseHfProgress('@hf-progress {"code":"capture","done":105,"total":600,"pct":33}'),
    ).toEqual({
      code: "capture",
      done: 105,
      total: 600,
      pct: 33,
    });
    expect(parseHfProgress("[INFO] something")).toBeNull();
    expect(parseHfProgress("@hf-progress {bad")).toBeNull();
    expect(parseHfProgress('@hf-progress {"code":"x"}')).toBeNull(); // no pct
  });

  it("parseFfmpegProgressSeconds reads out_time_us", () => {
    expect(parseFfmpegProgressSeconds("out_time_us=2500000")).toBe(2.5);
    expect(parseFfmpegProgressSeconds("frame=12")).toBeNull();
    expect(parseFfmpegProgressSeconds("out_time_us=N/A")).toBeNull();
  });

  it("overallPercent maps stages onto 0–100", () => {
    expect(overallPercent("preparing", 50)).toBe(1);
    expect(overallPercent("rendering", 0)).toBe(2);
    expect(overallPercent("rendering", 33)).toBe(31);
    expect(overallPercent("rendering", 100)).toBe(90);
    expect(overallPercent("encoding", 0)).toBe(90);
    expect(overallPercent("encoding", 50)).toBe(95);
    expect(overallPercent("encoding", 100)).toBe(100);
    expect(overallPercent("encoding", 150)).toBe(100);
  });

  it("estimate for 4:12 Final is about 18 minutes", () => {
    expect(estimateExportSeconds(252, "final", "1080p")).toBe(1068);
  });

  it("estimate for 60 minutes Final is about 4 hours", () => {
    expect(estimateExportSeconds(3600, "final", "1080p")).toBe(14460);
    expect(estimateExportSeconds(252, "draft", "1080p")).toBe(816);
    expect(estimateExportSeconds(252, "final", "1440p")).toBe(1169);
  });

  it("remainingSeconds uses the estimate until 20 frames are captured, then the measured rate", () => {
    expect(remainingSeconds({ elapsed: 100, percent: 10, estimate: 1000, framesCaptured: 5 })).toBe(
      900,
    );
    expect(
      remainingSeconds({ elapsed: 1200, percent: 60, estimate: 1000, framesCaptured: 500 }),
    ).toBe(800);
    expect(
      remainingSeconds({ elapsed: 2000, percent: 10, estimate: 1000, framesCaptured: 5 }),
    ).toBe(0);
    expect(remainingSeconds({ elapsed: 10, percent: 0, estimate: 1000, framesCaptured: 25 })).toBe(
      990,
    );
  });

  it("formatEstimate speaks in rounded minutes and hours", () => {
    expect(formatEstimate(30)).toBe("less than a minute");
    expect(formatEstimate(1068)).toBe("about 18 min");
    expect(formatEstimate(14460)).toBe("about 4 h 1 min");
    expect(formatEstimate(7200)).toBe("about 2 h");
  });
});
