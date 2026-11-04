// The shared template toolkit is plain browser JavaScript; under Node it loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Frame = ToolkitAnalysis["frames"][number];

function frame(overrides: Partial<Frame> = {}): Frame {
  return { b: new Array(32).fill(0), l: 0, k: 0, f: 0, ...overrides };
}

function fakeAnalysis(frames: Frame[], hits: [number, number][] = []): ToolkitAnalysis {
  return { version: 1, fps: 30, bands: 32, duration: frames.length / 30, frames, hits };
}

describe("mulberry32", () => {
  it("repeats for the same seed and stays in [0,1)", () => {
    const a = viz.mulberry32(777);
    const b = viz.mulberry32(777);
    const first = Array.from({ length: 1000 }, () => a());
    const second = Array.from({ length: 1000 }, () => b());
    expect(first).toEqual(second);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("hexToRGB", () => {
  it("reads #rrggbb and #rgb", () => {
    expect(viz.hexToRGB("#ff6a12")).toEqual([1, 106 / 255, 18 / 255]);
    expect(viz.hexToRGB("#fff")).toEqual([1, 1, 1]);
    expect(() => viz.hexToRGB("orange")).toThrow(/Not a colour/);
  });
});

describe("bandEdges", () => {
  it("match the analyzer", () => {
    const edges = viz.bandEdges();
    expect(edges).toHaveLength(33);
    expect(edges[0]).toBeCloseTo(30, 6);
    expect(edges[32]).toBeCloseTo(16000, 6);
    expect(edges[8]).toBeCloseTo(144.1687, 3); // numpy.geomspace(30, 16000, 33)[8]
  });
});

describe("createAudio", () => {
  it("sample interpolates between frames and clamps time", () => {
    const audio = viz.createAudio(fakeAnalysis([frame({ l: 0 }), frame({ l: 1 })]));
    expect(audio.sample(0.5 / 30).loud).toBeCloseTo(0.5, 6);
    expect(audio.sample(-1).loud).toBe(0);
    expect(audio.sample(999).loud).toBe(1);
  });

  it("kick beat range uses the analyzer's kick and hits", () => {
    const frames = Array.from({ length: 90 }, (_, i) => frame({ k: i / 100 }));
    const hits: [number, number][] = [
      [0.5, 0.8],
      [1.2, 0.6],
      [2.5, 1],
    ];
    const audio = viz.createAudio(fakeAnalysis(frames, hits));
    expect(audio.sample(1.5 / 30).beat).toBeCloseTo(0.015, 6);
    const recent = audio.recentHits(2.0, 4);
    expect(recent).toHaveLength(2);
    expect(recent[0][0]).toBeCloseTo(0.8, 6);
    expect(recent[0][1]).toBe(0.6);
    expect(recent[1][0]).toBeCloseTo(1.5, 6);
    expect(recent[1][1]).toBe(0.8);
  });

  it("a Hz beat range finds pulses in its own bands", () => {
    const frames = Array.from({ length: 60 }, (_, i) => {
      const b = new Array(32).fill(0);
      if (i >= 30) for (let k = 0; k <= 5; k++) b[k] = 1;
      return frame({ b });
    });
    const data = fakeAnalysis(frames);
    const low = viz.createAudio(data, { beatRange: "20-90" });
    const lowHits = low.recentHits(2, 10);
    expect(lowHits).toHaveLength(1);
    expect(Math.abs(2 - lowHits[0][0] - 1.0)).toBeLessThanOrEqual(1 / 30 + 1e-6);
    expect(low.sample(1.0).beat).toBeGreaterThan(0.5);
    const high = viz.createAudio(data, { beatRange: "3000-8000" });
    expect(high.recentHits(2, 10)).toHaveLength(0);
  });

  it("default spectrum equals the bands", () => {
    const b = Array.from({ length: 32 }, (_, k) => k / 31);
    const audio = viz.createAudio(fakeAnalysis([frame({ b }), frame({ b })]));
    const spectrum = audio.spectrum(0);
    const bands = audio.sample(0).bands;
    expect(spectrum).toHaveLength(32);
    for (let k = 0; k < 32; k++) expect(spectrum[k]).toBeCloseTo(bands[k], 6);
  });

  it("spectrum range and boost", () => {
    const b = Array.from({ length: 32 }, (_, k) => (k <= 8 ? 0.5 : 0.9));
    const data = fakeAnalysis([frame({ b })]);
    const low = viz.createAudio(data, { spectrumLow: 30, spectrumHigh: 144.3 }).spectrum(0);
    expect(low).toHaveLength(32);
    expect(Array.from(low).every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    const boosted = viz.createAudio(data, {
      spectrumLow: 30,
      spectrumHigh: 144.3,
      spectrumBoost: 2,
    });
    expect(boosted.spectrum(0)[0]).toBeCloseTo(0.75, 6);
  });

  it("spectrum with low ≥ high falls back to a valid range", () => {
    const b = Array.from({ length: 32 }, (_, k) => k / 31);
    const data = fakeAnalysis([frame({ b })]);
    const swapped = viz.createAudio(data, { spectrumLow: 5000, spectrumHigh: 100 }).spectrum(0);
    const normal = viz.createAudio(data, { spectrumLow: 100, spectrumHigh: 5000 }).spectrum(0);
    expect(Array.from(swapped)).toEqual(Array.from(normal));
    const same = viz.createAudio(data, { spectrumLow: 1000, spectrumHigh: 1000 }).spectrum(0);
    expect(Array.from(same).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  });
});
