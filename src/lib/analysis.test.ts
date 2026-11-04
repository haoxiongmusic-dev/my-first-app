import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYSIS_VERSION, isCurrentAnalysis, toAudioDataJs, type Analysis } from "@/lib/analysis";

const valid: Analysis = {
  version: ANALYSIS_VERSION,
  fps: 30,
  bands: 32,
  duration: 1.5,
  frames: [{ b: new Array(32).fill(0.5), l: 0.2, k: 0, f: 0.1 }],
  hits: [[0.5, 0.9]],
};

describe("isCurrentAnalysis", () => {
  it("accepts a current analysis", () => {
    expect(isCurrentAnalysis(valid)).toBe(true);
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["an older version", { ...valid, version: 0 }],
    ["missing frames", { ...valid, frames: undefined }],
  ])("rejects %s", (_name, value) => {
    expect(isCurrentAnalysis(value)).toBe(false);
  });
});

describe("toAudioDataJs", () => {
  it("wraps the analysis as a window.AUDIO_DATA script", () => {
    const js = toAudioDataJs(valid);
    expect(js.startsWith("window.AUDIO_DATA={")).toBe(true);
    expect(js.endsWith("};")).toBe(true);
    const json = js.slice("window.AUDIO_DATA=".length, -1);
    expect(JSON.parse(json)).toEqual(valid);
  });
});

describe("ANALYSIS_VERSION", () => {
  it("matches the Python analyzer's version", () => {
    const python = readFileSync(path.join(process.cwd(), "analyzer", "analyze.py"), "utf8");
    expect(python).toMatch(new RegExp(`^ANALYSIS_VERSION = ${ANALYSIS_VERSION}\\b`, "m"));
  });
});
