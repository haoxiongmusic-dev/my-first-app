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

  it("estimate includes the fixed start-up time measured on this PC", () => {
    // Measured: a 30 s Final section took 371 s; a 3 s Draft took 70 s.
    expect(estimateExportSeconds(30, "final", "1080p")).toBe(360);
    expect(estimateExportSeconds(3, "draft", "1080p")).toBe(99);
    expect(estimateExportSeconds(252, "final", "1080p")).toBe(1248);
  });

  it("estimate for 60 minutes Final is about 4 hours", () => {
    expect(estimateExportSeconds(3600, "final", "1080p")).toBe(14640);
    expect(estimateExportSeconds(252, "draft", "1080p")).toBe(846);
    expect(estimateExportSeconds(252, "final", "1440p")).toBe(1349);
  });

  it("remainingSeconds measures the rate from when capture began, not from the start", () => {
    // A 60-minute Final: about 90 s of setup brings HyperFrames to 24 % before any frame.
    const captureStart = { elapsed: 90, percent: 24 };
    // An hour into capture it is at 40 %: 16 % took 3600 s, so 60 % more takes 13 500 s.
    expect(
      remainingSeconds({
        elapsed: 3690,
        percent: 40,
        estimate: 14640,
        framesCaptured: 20000,
        captureStart,
      }),
    ).toBe(13500);
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
