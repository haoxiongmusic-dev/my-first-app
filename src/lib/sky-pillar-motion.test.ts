// Sky Pillar's motion maths (templates/sky-pillar/assets/pillar-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Motion = {
  TIP_Y: number;
  FLOOR_Y: number;
  FIGURE_HEIGHT: number;
  LINE_GAP: number;
  LINE_MAX: number;
  FLARE_RELEASE: number;
  FLARE_MAX: number;
  beamLevel: (loud: number, intensity: number) => number;
  lineCount: (bandPct: number) => number;
  lineOffsets: (count: number) => Float32Array;
  lineHalfWidths: (values: ArrayLike<number>, intensity: number) => Float32Array;
  flare: (env: number, intensity: number) => { halfWidth: number; strength: number };
  titleScale: (env: number, on: boolean) => number;
  smokeTime: (audio: ToolkitAudio, t: number) => number;
  figureOutline: () => [number, number][];
};
const m = require("../../templates/sky-pillar/assets/pillar-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 4 s: a kick every half second from 1.0 s, loud with a rising spectrum and flux from 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 60 ? Math.min(1, ((k + i) % 32) / 31) : 0)),
    l: i >= 60 ? 0.8 : 0,
    k: i >= 30 && i % 15 === 0 ? 1 : 0,
    f: i >= 60 ? 0.3 + (0.5 * ((i * 7) % 11)) / 10 : 0,
  }));
}
function analysis(fr: Frame[]): ToolkitAnalysis {
  return { version: 1, fps: FPS, bands: 32, duration: fr.length / FPS, frames: fr, hits: [] };
}
const full = analysis(frames());
const silentData = analysis(
  Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
);

describe("Sky Pillar motion", () => {
  it("the beam's width and brightness are 0.7 + 0.5 × loud × intensity", () => {
    expect(m.beamLevel(0, 1)).toBeCloseTo(0.7, 9);
    expect(m.beamLevel(1, 1)).toBeCloseTo(1.2, 9);
    expect(m.beamLevel(0.5, 2)).toBeCloseTo(1.2, 9);
    expect(m.beamLevel(1, 2)).toBeCloseTo(1.7, 9);
    // loudness outside 0..1 is clamped, so the beam can't vanish or blow up
    expect(m.beamLevel(-1, 1)).toBeCloseTo(0.7, 9);
    expect(m.beamLevel(3, 1)).toBeCloseTo(1.2, 9);
  });

  it("the tip is at y 470, the figure stands at y 600 and is 70 px tall", () => {
    expect(m.TIP_Y).toBe(470);
    expect(m.FLOOR_Y).toBe(600);
    expect(m.FIGURE_HEIGHT).toBe(70);
  });

  it("the Bands setting picks an odd number of tip lines: 5 at the default 55 %", () => {
    expect(m.lineCount(55)).toBe(5);
    expect(m.lineCount(10)).toBe(3);
    expect(m.lineCount(100)).toBe(9);
    for (let pct = 10; pct <= 100; pct++) {
      const n = m.lineCount(pct);
      expect(n % 2).toBe(1);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      if (pct > 10) expect(n).toBeGreaterThanOrEqual(m.lineCount(pct - 1));
    }
  });

  it("the tip lines are 6 px apart, centred on the tip", () => {
    expect(Array.from(m.lineOffsets(5))).toEqual([-12, -6, 0, 6, 12]);
    expect(Array.from(m.lineOffsets(3))).toEqual([-6, 0, 6]);
  });

  it("the middle line reads the bass, mirrored out to the outer lines", () => {
    const spectrum = Array.from({ length: 16 }, (_, i) => 1 - i / 15);
    const v = Array.from(viz.mirrorBars(spectrum, 5, true));
    expect(v[2]).toBeCloseTo(1, 6); // bass in the middle
    expect(v[0]).toBeCloseTo(v[4], 9);
    expect(v[1]).toBeCloseTo(v[3], 9);
    expect(v[2]).toBeGreaterThan(v[1]);
    expect(v[1]).toBeGreaterThan(v[0]);
  });

  it("line half-widths follow the square of the value and cap at 160 px", () => {
    expect(m.LINE_GAP).toBe(6);
    expect(m.LINE_MAX).toBe(160);
    expect(Array.from(m.lineHalfWidths([0, 0.5, 1], 1))).toEqual([0, 40, 160]);
    expect(Array.from(m.lineHalfWidths([0.5, 1, 2], 2))).toEqual([80, 160, 160]);
  });

  it("the flare is a thin line through the tip that grows with the beat, inside the frame", () => {
    expect(m.FLARE_RELEASE).toBe(0.25);
    expect(m.flare(0, 1)).toEqual({ halfWidth: 0, strength: 0 });
    const f = m.flare(1, 1);
    expect(f.strength).toBe(1);
    expect(f.halfWidth).toBeGreaterThan(300);
    expect(m.flare(1, 2).halfWidth).toBeLessThanOrEqual(m.FLARE_MAX);
    expect(m.FLARE_MAX).toBeLessThanOrEqual(960);
    expect(m.flare(0.5, 1).halfWidth).toBeLessThan(f.halfWidth);
  });

  it("the title pulses 1 + 0.03 × env, only when switched on", () => {
    expect(m.titleScale(1, true)).toBeCloseTo(1.03, 9);
    expect(m.titleScale(0.5, true)).toBeCloseTo(1.015, 9);
    expect(m.titleScale(1, false)).toBe(1);
    expect(m.titleScale(0, true)).toBe(1);
  });

  it("the smoke drifts with time and goes a little faster when the music changes (flux)", () => {
    const silent = viz.createAudio(silentData);
    const s1 = m.smokeTime(silent, 1);
    const s2 = m.smokeTime(silent, 2);
    expect(s2).toBeGreaterThan(s1); // still drifting in silence
    expect(m.smokeTime(silent, 2)).toBe(s2); // the same time gives the same drift
    const whole = viz.createAudio(full);
    // over the same second, the busy part drifts further than the quiet part
    const quiet = m.smokeTime(whole, 1.9) - m.smokeTime(whole, 0.9);
    const busy = m.smokeTime(whole, 3.0) - m.smokeTime(whole, 2.0);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy).toBeLessThan(quiet * 4); // "a little"
  });

  it("a section's smoke and flare match the full song at the same moment", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3.5));
    for (const t of [0.5, 0.9, 1.3, 1.7]) {
      expect(m.smokeTime(section, t)).toBeCloseTo(m.smokeTime(whole, t + 1.5), 6);
      expect(viz.beatEnvelope(section, t, m.FLARE_RELEASE)).toBeCloseTo(
        viz.beatEnvelope(whole, t + 1.5, m.FLARE_RELEASE),
        6,
      );
    }
  });

  it("the figure is a closed outline 70 px tall, standing on y 0, narrow and centred", () => {
    const pts = m.figureOutline();
    expect(pts.length).toBeGreaterThan(12);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(-70, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(30);
    expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(1);
    expect(m.figureOutline()).toEqual(pts);
  });

  it("silence gives a calm beam, no lines, no flare, no pulse, with no NaN", () => {
    const silent = viz.createAudio(silentData, { spectrumCount: 16 });
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const values = viz.mirrorBars(silent.spectrum(t), m.lineCount(55), true);
      expect(Array.from(m.lineHalfWidths(values, 1)).every((x) => x === 0)).toBe(true);
      const env = viz.beatEnvelope(silent, t, m.FLARE_RELEASE);
      expect(env).toBe(0);
      expect(m.flare(env, 1)).toEqual({ halfWidth: 0, strength: 0 });
      expect(m.titleScale(env, true)).toBe(1);
      expect(m.beamLevel(silent.sample(t).loud, 1)).toBeCloseTo(0.7, 9);
      expect(Number.isFinite(m.smokeTime(silent, t))).toBe(true);
    }
  });
});
