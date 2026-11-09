// Neon Coil's motion maths (templates/neon-coil/assets/coil-motion.js): worked out from the song
// time alone (or seeded), so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Streak = { y: number; x0: number; x1: number; thick: number; alpha: number };
type Motion = {
  COVER_X: number;
  COVER_Y: number;
  COVER_SIZE: number;
  LINE_Y: number;
  LINE_X0: number;
  LINE_X1: number;
  BLOB_COUNT: number;
  BLOB_MAX: number;
  PUMP_RELEASE: number;
  BEAT_SCALE: number;
  LINE_FULL: number;
  SEGMENTS: number;
  STRIDE: number;
  PHASE_RATE: number;
  GLITCH_TOP: number;
  GLITCH_SLOT: number;
  VALLEY: number;
  lineCount: (bandPct: number) => number;
  coilPhase: (songTime: number) => number;
  spinePoint: (s: number, songTime: number) => [number, number, number, number];
  coilWidth: (s: number) => number;
  pump: (env: number, intensity: number) => { spread: number; glow: number };
  coilLines: (
    count: number,
    levels: ArrayLike<number>,
    songTime: number,
    env: number,
    intensity: number,
  ) => Float32Array;
  shapeLevels: (values: ArrayLike<number>) => Float32Array;
  blobWeights: (mulberry32: VizToolkit["mulberry32"]) => Float32Array;
  blobCentre: (i: number) => number;
  blobHeights: (
    values: ArrayLike<number>,
    weights: ArrayLike<number>,
    intensity: number,
  ) => Float32Array;
  blobProfile: (heights: ArrayLike<number>, x: number) => number;
  glitchStreaks: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => Streak[];
  coverScale: (env: number, on: boolean) => number;
  glowLevel: (loud: number) => number;
};
const m = require("../../templates/neon-coil/assets/coil-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 8 s: silent for the first second, then loud and bass-heavy, a kick every half second. */
function frames(): Frame[] {
  return Array.from({ length: 8 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 30 ? Math.max(0, 1 - k / 12) : 0)),
    l: i >= 30 ? 0.8 : 0,
    k: i >= 30 && i % 15 === 0 ? 1 : 0,
    f: i >= 30 ? 0.4 : 0,
  }));
}
const full: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 8,
  frames: frames(),
  hits: Array.from({ length: 14 }, (_, i) => [1 + i * 0.5, 0.9] as [number, number]),
};
const silent: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 3,
  frames: Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
  hits: [],
};

function allFinite(xs: ArrayLike<number>): boolean {
  for (let i = 0; i < xs.length; i++) if (!Number.isFinite(xs[i])) return false;
  return true;
}
/** Across the lines at segment j: the spread of their offsets from the spine (px). */
function spreadAt(lines: Float32Array, count: number, j: number, songTime: number): number {
  const S = m.STRIDE,
    P = m.SEGMENTS + 1;
  const s = j / m.SEGMENTS;
  const [sx, sy, nx, ny] = m.spinePoint(s, songTime);
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = (i * P + j) * S;
    const off = (lines[o] - sx) * nx + (lines[o + 1] - sy) * ny;
    lo = Math.min(lo, off);
    hi = Math.max(hi, off);
  }
  return hi - lo;
}

describe("Neon Coil motion", () => {
  it("lays the scene out as the spec says", () => {
    // the cover: square, 300 px, left-middle
    expect(m.COVER_SIZE).toBe(300);
    expect(m.COVER_X).toBeLessThan(600);
    expect(Math.abs(m.COVER_Y - 540)).toBeLessThan(80);
    // the line runs from the cover to the right edge
    expect(m.LINE_X0).toBeCloseTo(m.COVER_X + m.COVER_SIZE / 2, 0);
    expect(m.LINE_X1).toBe(1920);
    expect(m.LINE_Y).toBeGreaterThan(m.COVER_Y - m.COVER_SIZE / 2);
    expect(m.LINE_Y).toBeLessThan(m.COVER_Y + m.COVER_SIZE / 2);
    expect(m.BLOB_COUNT).toBe(12);
    expect(m.BLOB_MAX).toBe(50);
    expect(m.PUMP_RELEASE).toBe(0.3);
    expect(m.BEAT_SCALE).toBe(0.03);
  });

  it("bands: coil lines from a fifth of the full fan up to all of it, ≈ 40 at 75 %", () => {
    expect(m.lineCount(75)).toBe(40);
    expect(m.lineCount(100)).toBe(m.LINE_FULL);
    expect(m.lineCount(10)).toBe(Math.round(m.LINE_FULL * 0.2));
    expect(m.lineCount(500)).toBe(m.LINE_FULL);
    expect(m.lineCount(-3)).toBe(Math.round(m.LINE_FULL * 0.2));
    expect(Number.isInteger(m.lineCount(NaN))).toBe(true);
    expect(m.lineCount(NaN)).toBeGreaterThan(0);
  });

  it("the coil sweeps from the bottom-left, up and over, to the right, widening as it goes", () => {
    const start = m.spinePoint(0, 0);
    const end = m.spinePoint(1, 0);
    expect(start[0]).toBeLessThan(200);
    expect(start[1]).toBeGreaterThan(900);
    expect(end[0]).toBeGreaterThan(1800);
    let top = Infinity;
    for (let s = 0; s <= 1; s += 0.01) {
      const p = m.spinePoint(s, 0);
      expect(allFinite(p)).toBe(true);
      expect(Math.hypot(p[2], p[3])).toBeCloseTo(1, 6); // a unit normal
      top = Math.min(top, p[1]);
    }
    expect(top).toBeLessThan(300); // it rises over the top of the frame
    expect(m.coilWidth(0)).toBeLessThan(m.coilWidth(0.6) / 2); // a fan: narrow at its root
  });

  it("geometry is time-only: the same song time gives the same coil, a section matches", () => {
    const n = m.lineCount(75);
    const levels = new Float32Array(n).fill(0.5);
    const a = m.coilLines(n, levels, 12.3, 0.4, 1);
    expect(a.length).toBe(n * (m.SEGMENTS + 1) * m.STRIDE);
    expect(Array.from(m.coilLines(n, levels, 12.3, 0.4, 1))).toEqual(Array.from(a));
    // a section starting at 2.5 s draws what the full song draws at the same song time
    const section = viz.createAudio(sliceAnalysis(full, 2.5, 6));
    const whole = viz.createAudio(full);
    for (const t of [0, 0.4, 1.9]) {
      const envS = viz.beatEnvelope(section, t, m.PUMP_RELEASE);
      const envW = viz.beatEnvelope(whole, 2.5 + t, m.PUMP_RELEASE);
      expect(envS).toBeCloseTo(envW, 6);
      const fromSection = m.coilLines(n, levels, section.songStart + t, envS, 1);
      const fromWhole = m.coilLines(n, levels, 2.5 + t, envW, 1);
      let worst = 0;
      for (let i = 0; i < fromSection.length; i++)
        worst = Math.max(worst, Math.abs(fromSection[i] - fromWhole[i]));
      expect(worst).toBeLessThan(1e-3);
    }
  });

  it("twists slowly: the phase advances with the song time and the pinches travel", () => {
    expect(m.coilPhase(0)).toBe(0);
    expect(m.coilPhase(10)).toBeCloseTo(10 * m.PHASE_RATE, 9);
    expect(m.coilPhase(NaN)).toBe(0);
    // slowly: under a sixth of a turn per second
    expect(m.PHASE_RATE).toBeGreaterThan(0);
    expect(m.PHASE_RATE).toBeLessThan(Math.PI / 3);
    const n = 40;
    const levels = new Float32Array(n).fill(0.5);
    const a = m.coilLines(n, levels, 5, 0, 1);
    const b = m.coilLines(n, levels, 5 + 1 / FPS, 0, 1);
    const c = m.coilLines(n, levels, 8, 0, 1);
    let step = 0,
      far = 0;
    for (let i = 0; i < a.length; i += m.STRIDE) {
      step = Math.max(step, Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1]));
      far = Math.max(far, Math.hypot(c[i] - a[i], c[i + 1] - a[i + 1]));
    }
    expect(step).toBeLessThan(12); // smooth from frame to frame
    expect(far).toBeGreaterThan(40); // but clearly moving over seconds
  });

  it("the lines bunch where the ribbon turns edge-on and fan out where it faces us", () => {
    const n = 40;
    const lines = m.coilLines(n, new Float32Array(n).fill(0.5), 3, 0, 1);
    let lo = Infinity,
      hi = 0;
    for (let j = Math.round(m.SEGMENTS * 0.3); j <= Math.round(m.SEGMENTS * 0.9); j++) {
      const w = spreadAt(lines, n, j, 3);
      lo = Math.min(lo, w);
      hi = Math.max(hi, w);
    }
    expect(hi).toBeGreaterThan(250); // a big fan
    expect(lo).toBeLessThan(hi * 0.35); // and a tight pinch, white-hot
    // depth and fade stay in range
    let outOfRange = 0;
    for (let o = 0; o < lines.length; o += m.STRIDE) {
      if (Math.abs(lines[o + 2]) > 1 + 1e-6) outOfRange++;
      if (!(lines[o + 3] >= 0 && lines[o + 3] <= 1)) outOfRange++;
    }
    expect(outOfRange).toBe(0);
  });

  it("the beat pump: brightness and spread grow with the envelope, capped, rest at 1", () => {
    expect(m.pump(0, 1)).toEqual({ spread: 1, glow: 1 });
    let prev = m.pump(0, 1);
    for (let e = 0.1; e <= 1.0001; e += 0.1) {
      const p = m.pump(e, 1);
      expect(p.spread).toBeGreaterThan(prev.spread);
      expect(p.glow).toBeGreaterThan(prev.glow);
      prev = p;
    }
    const top = m.pump(1, 2);
    expect(top.spread).toBeLessThan(1.4);
    expect(top.glow).toBeLessThan(3);
    expect(m.pump(5, 9)).toEqual(m.pump(1, 2)); // capped
    expect(m.pump(NaN, NaN)).toEqual({ spread: 1, glow: 1 });
    // the fan is wider on the beat
    const n = 40;
    const lv = new Float32Array(n).fill(0.5);
    const calm = m.coilLines(n, lv, 4, 0, 1);
    const kick = m.coilLines(n, lv, 4, 1, 1);
    const j = Math.round(m.SEGMENTS * 0.6);
    expect(spreadAt(kick, n, j, 4)).toBeGreaterThan(spreadAt(calm, n, j, 4) * 1.05);
    // the envelope (release 0.3 s) jumps on a kick and falls away within about a second
    const audio = viz.createAudio(full);
    const onBeat = viz.beatEnvelope(audio, 2.0, m.PUMP_RELEASE);
    const after = viz.beatEnvelope(audio, 2.15, m.PUMP_RELEASE);
    expect(onBeat).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(onBeat);
    // cover and text scale on the beat by 1 + 0.03 × env, or not at all when switched off
    expect(m.coverScale(0, true)).toBe(1);
    expect(m.coverScale(1, true)).toBeCloseTo(1.03, 9);
    expect(m.coverScale(0.5, true)).toBeCloseTo(1.015, 9);
    expect(m.coverScale(1, false)).toBe(1);
    expect(m.coverScale(NaN, true)).toBe(1);
    expect(m.coverScale(7, true)).toBeCloseTo(1.03, 9);
  });

  it("blobs: 12 along the line, capped at 50 px × intensity, bass at the left", () => {
    const w = m.blobWeights(viz.mulberry32);
    expect(w.length).toBe(12);
    expect(Array.from(m.blobWeights(viz.mulberry32))).toEqual(Array.from(w)); // seeded
    let lo = 1,
      hi = 0;
    for (const x of w) {
      expect(x).toBeGreaterThan(0.5);
      expect(x).toBeLessThanOrEqual(1);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    expect(hi - lo).toBeGreaterThan(0.1); // seeded variety
    for (const intensity of [0.2, 1, 2]) {
      const h = m.blobHeights(
        new Float32Array(12).fill(1),
        new Float32Array(12).fill(1),
        intensity,
      );
      expect(h.length).toBe(12);
      for (const x of h) expect(x).toBeLessThanOrEqual(m.BLOB_MAX * intensity + 1e-6);
      expect(h[0]).toBeCloseTo(m.BLOB_MAX * intensity, 3); // the loudest bass blob is full size
    }
    expect(Math.max(...m.blobHeights(new Float32Array(12).fill(5), w, 9))).toBeLessThanOrEqual(
      m.BLOB_MAX * 2 + 1e-6,
    );
    // a bass-heavy spectrum, sampled at 12 points along the line: the left blobs are biggest
    const spec = Float32Array.from({ length: 32 }, (_, k) => Math.max(0, 1 - k / 10));
    const values = viz.mirrorBars(viz.smoothSpectrum(spec, 2), 12, false);
    const h = m.blobHeights(values, w, 1);
    expect(h[0] + h[1]).toBeGreaterThan(h[10] + h[11]);
    expect(Math.max(...h)).toBe(Math.max(h[0], h[1], h[2]));
    expect(h[11]).toBeLessThan(2);
    // centres run left to right along the line, between the cover and the right edge
    for (let i = 0; i < 12; i++) {
      expect(m.blobCentre(i)).toBeGreaterThan(m.LINE_X0);
      expect(m.blobCentre(i)).toBeLessThan(m.LINE_X1);
      if (i > 0) expect(m.blobCentre(i)).toBeGreaterThan(m.blobCentre(i - 1));
    }
  });

  it("blobs: symmetric lens shapes, tallest at their centres, pinched to the line between", () => {
    const h = Float32Array.from({ length: 12 }, (_, i) => 10 + i * 3);
    for (let i = 0; i < 12; i++) {
      const c = m.blobCentre(i);
      expect(m.blobProfile(h, c)).toBeCloseTo(h[i], 6);
      // symmetric left and right of its centre
      expect(m.blobProfile(h, c - 20)).toBeCloseTo(m.blobProfile(h, c + 20), 6);
      expect(m.blobProfile(h, c - 20)).toBeLessThan(h[i]);
    }
    // back to the bare line halfway between two blobs, and off the ends
    const mid = (m.blobCentre(3) + m.blobCentre(4)) / 2;
    expect(m.blobProfile(h, mid)).toBeLessThan(0.5);
    expect(m.blobProfile(h, m.LINE_X0)).toBe(0);
    expect(m.blobProfile(h, 1920)).toBe(0);
    for (let x = m.LINE_X0; x <= m.LINE_X1; x += 7) {
      const b = m.blobProfile(h, x);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(Math.max(...h) + 1e-6);
    }
  });

  it("a loud, nearly full spectrum still makes blobs of clearly different sizes", () => {
    const loud = Float32Array.from({ length: 12 }, (_, k) => 0.82 + 0.18 * Math.sin(k / 2) ** 2);
    const shaped = m.shapeLevels(loud);
    expect(Math.min(...shaped) / Math.max(...shaped)).toBeLessThan(0.55);
    // the order is kept and the loudest keeps its level
    const hi = Math.max(...loud);
    for (let k = 0; k < 12; k++) {
      expect(shaped[k]).toBeLessThanOrEqual(loud[k] + 1e-6);
      if (loud[k] === hi) expect(shaped[k]).toBeCloseTo(hi, 6);
    }
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++)
        if (loud[a] > loud[b] + 1e-6) expect(shaped[a]).toBeGreaterThan(shaped[b]);
    expect(m.VALLEY).toBeGreaterThan(0.2);
    expect(m.VALLEY).toBeLessThan(0.6);
  });

  it("glitch streaks: rare, thin, near the top, seeded by the song time", () => {
    let shown = 0,
      total = 0,
      longest = 0,
      run = 0;
    for (let f = 0; f < 120 * FPS; f++) {
      const s = f / FPS;
      const list = m.glitchStreaks(s, viz.mulberry32);
      expect(m.glitchStreaks(s, viz.mulberry32)).toEqual(list);
      total++;
      if (list.length > 0) {
        shown++;
        run++;
        longest = Math.max(longest, run);
      } else run = 0;
      for (const g of list) {
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeLessThanOrEqual(m.GLITCH_TOP);
        expect(g.thick).toBeGreaterThan(0);
        expect(g.thick).toBeLessThanOrEqual(3);
        expect(g.x1).toBeGreaterThan(g.x0);
        expect(g.alpha).toBeGreaterThan(0);
        expect(g.alpha).toBeLessThanOrEqual(1);
      }
    }
    // rare: on screen a small share of the time, and each one only briefly
    expect(shown / total).toBeGreaterThan(0.02);
    expect(shown / total).toBeLessThan(0.2);
    expect(longest).toBeLessThanOrEqual(Math.ceil(m.GLITCH_SLOT * FPS));
    // a section draws the same streaks as the full song at the same song time
    const section = viz.createAudio(sliceAnalysis(full, 3.2, 7));
    for (let t = 0; t < 3.8; t += 1 / FPS) {
      expect(m.glitchStreaks(section.songStart + t, viz.mulberry32)).toEqual(
        m.glitchStreaks(3.2 + t, viz.mulberry32),
      );
    }
    expect(m.glitchStreaks(NaN, viz.mulberry32)).toEqual([]);
    expect(m.glitchStreaks(-1, viz.mulberry32)).toEqual([]);
  });

  it("silence: a calm coil and a bare line, never NaN", () => {
    const audio = viz.createAudio(silent, { spectrumCount: 32 });
    const env = viz.beatEnvelope(audio, 1, m.PUMP_RELEASE);
    expect(env).toBe(0);
    const spec = audio.spectrum(1);
    const n = m.lineCount(75);
    const levels = viz.mirrorBars(m.shapeLevels(spec), n, false);
    const lines = m.coilLines(n, levels, 1, env, 1);
    expect(allFinite(lines)).toBe(true);
    expect(allFinite(m.coilLines(n, new Float32Array(n).fill(NaN), NaN, NaN, NaN))).toBe(true);
    const values = viz.mirrorBars(viz.smoothSpectrum(spec, 2), 12, false);
    const h = m.blobHeights(values, m.blobWeights(viz.mulberry32), 1);
    expect(Array.from(h)).toEqual(new Array(12).fill(0));
    expect(
      Array.from(m.blobHeights(new Float32Array(12).fill(NaN), new Float32Array(12).fill(1), 1)),
    ).toEqual(new Array(12).fill(0));
    expect(m.blobProfile(h, 900)).toBe(0);
    expect(Array.from(m.shapeLevels(new Float32Array(32).fill(NaN))).every((x) => x === 0)).toBe(
      true,
    );
    expect(m.pump(env, 1)).toEqual({ spread: 1, glow: 1 });
    expect(m.coverScale(env, true)).toBe(1);
    expect(m.glowLevel(NaN)).toBe(m.glowLevel(0));
    expect(m.glowLevel(0)).toBeGreaterThan(0); // the coil still shows in silence
    expect(m.glowLevel(1)).toBeGreaterThan(m.glowLevel(0) * 2); // and lights up when loud
    expect(m.glowLevel(5)).toBe(m.glowLevel(1));
  });
});
