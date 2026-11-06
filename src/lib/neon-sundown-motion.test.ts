// Neon Sundown's motion and scene maths (templates/neon-sundown/assets/sundown-motion.js):
// worked out from the song time alone, so any frame can be drawn on its own.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Side = "outside" | "inside" | "both";
type Motion = {
  ARC: number;
  SUN: { x: number; y: number; r: number };
  COVER_R: number;
  HORIZON: number;
  OUT_START: number;
  OUT_MAX: number;
  IN_MAX: number;
  PULSE_RELEASE: number;
  barLengths: (
    values: ArrayLike<number>,
    intensity: number,
    side: Side,
    hasCover: boolean,
  ) => { outer: Float32Array; inner: Float32Array };
  barCount: (V: VizToolkit, pct: number) => number;
  sunPulse: (env: number, intensity: number) => number;
  gridOffset: (songTime: number, speedPct: number) => number;
  gridBrightness: (env: number) => number;
  mountainLevel: (loud: number) => number;
  stripeOffset: (songTime: number) => number;
  sunGaps: (offset: number) => [number, number][];
  buildMountains: (mulberry32: (seed: number) => () => number) => {
    far: Float32Array;
    near: Float32Array;
  };
  buildStars: (mulberry32: (seed: number) => () => number) => Float32Array;
};
const m = require("../../templates/neon-sundown/assets/sundown-motion.js") as Motion;

const arr = (a: ArrayLike<number>) => Array.from(a);

describe("Neon Sundown motion", () => {
  it("bars follow the square of the value, outside up to 120 px, inside up to 50 px", () => {
    const out = m.barLengths([0, 0.5, 1], 1, "outside", false);
    expect(arr(out.outer)).toEqual([0, 30, 120]);
    expect(arr(out.inner)).toEqual([0, 0, 0]);
    const inside = m.barLengths([0, 0.5, 1], 1, "inside", false);
    expect(arr(inside.outer)).toEqual([0, 0, 0]);
    expect(arr(inside.inner)).toEqual([0, 12.5, 50]);
    const both = m.barLengths([0, 0.5, 1], 1, "both", false);
    expect(arr(both.outer)).toEqual([0, 30, 120]);
    expect(arr(both.inner)).toEqual([0, 12.5, 50]);
    expect(arr(m.barLengths([0, 0.9, 1], 2, "outside", false).outer)).toEqual([0, 120, 120]);
  });

  it("inside bars never reach the cover, even at the strongest pulse", () => {
    const pulse = m.sunPulse(1, 2);
    const inner = m.barLengths([1, 1], 2, "inside", true).inner;
    expect(inner[0]).toBe(50);
    const innerEnd = (m.SUN.r - inner[0]) * pulse;
    expect(innerEnd).toBeGreaterThanOrEqual(m.COVER_R * pulse + 6);
    expect(m.barLengths([1], 2, "both", false).inner[0]).toBe(50); // no cover: same cap
  });

  it("the bar count follows Bands over a 220° arc centred on the top", () => {
    expect(m.barCount(viz, 70)).toBe(viz.bandsToRingCount(70, 96));
    const angles = arr(viz.ringAngles(m.barCount(viz, 100), m.ARC));
    expect(m.ARC).toBe(220);
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual((110 * Math.PI) / 180 + 1e-6);
  });

  it("the sun pulses up to 4 % per unit of intensity", () => {
    expect(m.sunPulse(1, 1)).toBeCloseTo(1.04, 9);
    expect(m.sunPulse(0, 2)).toBe(1);
  });

  it("the grid scrolls by time only, and stands still at 0 % speed", () => {
    expect(m.gridOffset(0.25, 100)).toBeCloseTo(0.5, 9);
    expect(m.gridOffset(1.0, 100)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const v = m.gridOffset(i * 0.37, 150);
      expect(v >= 0 && v < 1).toBe(true);
    }
    for (const t of [0, 3.3, 100, 2399.9]) expect(m.gridOffset(t, 0)).toBe(0);
    expect(m.gridBrightness(0)).toBeCloseTo(0.55, 9);
    expect(m.gridBrightness(1)).toBeCloseTo(1, 9);
    expect(m.mountainLevel(0)).toBeCloseTo(0.6, 9);
  });

  it("the sun's gaps drift down, getting thicker toward the bottom", () => {
    expect(m.stripeOffset(5)).toBeCloseTo(0.25, 9);
    const gaps = m.sunGaps(0);
    expect(gaps.map(([a, b]) => (a + b) / 2).map((c) => Math.round(c * 6))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i][1] - gaps[i][0]).toBeGreaterThan(gaps[i - 1][1] - gaps[i - 1][0]);
    }
    for (const [a, b] of gaps) expect(a < b).toBe(true);
    const shifted = m.sunGaps(0.5);
    expect((shifted[0][0] + shifted[0][1]) / 2).toBeCloseTo(1 / 12, 9);
  });

  it("the mountains are the same every time, with a valley the sun shows through", () => {
    const a = m.buildMountains(viz.mulberry32);
    expect(m.buildMountains(viz.mulberry32)).toEqual(a);
    const ranges: [Float32Array, number][] = [
      [a.far, 150],
      [a.near, 230],
    ];
    for (const [ridge, maxH] of ranges) {
      expect(ridge).toHaveLength(97);
      for (const y of arr(ridge)) {
        expect(y).toBeLessThanOrEqual(640);
        expect(y).toBeGreaterThanOrEqual(640 - maxH - 1e-6);
      }
      for (let i = 38; i <= 58; i++) expect(ridge[i]).toBeGreaterThanOrEqual(600);
    }
  });

  it("the stars are the same every time, all in the top half", () => {
    const s = m.buildStars(viz.mulberry32);
    expect(m.buildStars(viz.mulberry32)).toEqual(s);
    expect(s).toHaveLength(200 * 4);
    for (let i = 0; i < 200; i++) {
      const [x, y, size, bright] = arr(s.slice(4 * i, 4 * i + 4));
      expect(x >= 0 && x < 1920 && y >= 0 && y < 540).toBe(true);
      expect(size >= 1 && size <= 2).toBe(true);
      expect(bright >= 0.2 && bright <= 0.7).toBe(true);
    }
  });

  it("silence gives no bars, no pulse and the base grid brightness, with no NaN", () => {
    const frames: ToolkitAnalysis["frames"] = Array.from({ length: 90 }, () => ({
      b: new Array(32).fill(0),
      l: 0,
      k: 0,
      f: 0,
    }));
    const silent = viz.createAudio(
      { version: 1, fps: 30, bands: 32, duration: 3, frames, hits: [] },
      { spectrumCount: 24 },
    );
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const values = viz.ringValues(silent.spectrum(t), viz.ringAngles(70, m.ARC), m.ARC);
      const bars = m.barLengths(values, 1, "both", true);
      expect([...arr(bars.outer), ...arr(bars.inner)].every((x) => x === 0)).toBe(true);
      const env = viz.beatEnvelope(silent, t, m.PULSE_RELEASE);
      expect(m.sunPulse(env, 1)).toBe(1);
      expect(m.gridBrightness(env)).toBeCloseTo(0.55, 9);
    }
  });
});
