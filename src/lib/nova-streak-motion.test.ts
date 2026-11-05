// Nova Streak's motion maths (templates/nova-streak/assets/streak-motion.js): everything is
// worked out from the song time alone, so any frame can be drawn on its own and every render
// (and every section of a song) looks the same.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Audio = ReturnType<VizToolkit["createAudio"]>;
type Arc = { alpha: number; points: Float32Array };
type Motion = {
  streakLevel: (loud: number, intensity: number) => number;
  bandsToCount: (pct: number) => number;
  barHeights: (values: ArrayLike<number>, intensity: number) => Float32Array;
  barLayout: (
    count: number,
    hasCover: boolean,
  ) => { inner: number; outer: number; width: number; centres: Float32Array };
  coverEnvelope: (audio: Audio, t: number) => number;
  coverScale: (env: number, intensity: number) => number;
  arcBursts: (
    audio: Audio,
    t: number,
    half: number,
    glow: number,
    mulberry32: (seed: number) => () => number,
  ) => Arc[];
  starTwinkle: (audio: Audio, t: number) => number;
  buildStars: (density: number, mulberry32: (seed: number) => () => number) => Float32Array;
  starX: (x0: number, depth: number, songTime: number) => number;
};
const m = require("../../templates/nova-streak/assets/streak-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 4 s: silent, a kick at 1.0 s, loud from 2.0 s with a rising spectrum, a hit at 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => {
    const loud = i >= 60;
    return {
      b: Array.from({ length: 32 }, (_, k) => (loud ? Math.min(1, ((k + i) % 32) / 31) : 0)),
      l: loud ? 0.8 : 0,
      k: i === 30 ? 1 : 0,
      f: 0,
    };
  });
}

function analysis(fr: Frame[], hits: [number, number][]): ToolkitAnalysis {
  return { version: 1, fps: FPS, bands: 32, duration: fr.length / FPS, frames: fr, hits };
}

const full = analysis(frames(), [[2.0, 1]]);
const audio = viz.createAudio(full);
const silent = viz.createAudio(
  analysis(
    Array.from({ length: 5 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
    [],
  ),
);

/** How far a point is from the edge of the square of half-size `half` centred on (0, 0). */
function fromBorder(x: number, y: number, half: number): number {
  const ax = Math.abs(x),
    ay = Math.abs(y);
  if (ax <= half && ay <= half) return Math.min(half - ax, half - ay);
  return Math.hypot(Math.max(ax - half, 0), Math.max(ay - half, 0));
}

describe("Nova Streak motion", () => {
  it("streakLevel rests at 0.55 in silence and caps at 1", () => {
    expect(m.streakLevel(0, 1)).toBe(0.55);
    expect(m.streakLevel(1, 2)).toBe(1);
    expect(m.streakLevel(0.5, 1)).toBeCloseTo(0.775, 6);
  });

  it("bandsToCount maps 10→16 and 100→96", () => {
    expect(m.bandsToCount(10)).toBe(16);
    expect(m.bandsToCount(100)).toBe(96);
  });

  it("barHeights scale by intensity and cap at 300", () => {
    expect(Array.from(m.barHeights([0, 0.5, 1], 1))).toEqual([0, 130, 260]);
    expect(Array.from(m.barHeights([0, 0.5, 1], 2))).toEqual([0, 260, 300]);
  });

  it("barLayout starts at the cover's edge or the centre and ends at 921.6", () => {
    const withCover = m.barLayout(96, true);
    expect(withCover.inner).toBe(200);
    expect(withCover.centres).toHaveLength(96);
    expect(withCover.centres[95] + withCover.width / 2).toBeCloseTo(921.6, 3);
    expect(withCover.centres[0] - withCover.width / 2).toBeCloseTo(200, 3);
    expect(m.barLayout(16, false).inner).toBe(0);
  });

  it("the cover pulses on the beat: 1 in silence, 1.06 at a full beat", () => {
    expect(m.coverScale(0, 1)).toBe(1);
    expect(m.coverScale(1, 1)).toBeCloseTo(1.06, 9);
    expect(m.coverEnvelope(audio, 0.5)).toBe(0);
    expect(m.coverEnvelope(audio, 1.0)).toBeGreaterThan(0.9);
    // it falls to about a third over the 0.18 s release
    expect(m.coverEnvelope(audio, 1.18)).toBeCloseTo(Math.exp(-1), 1);
  });

  it("arcs are the same for the same time", () => {
    const a = m.arcBursts(audio, 2.1, 180, 70, viz.mulberry32);
    expect(a.length).toBeGreaterThan(0);
    expect(m.arcBursts(audio, 2.1, 180, 70, viz.mulberry32)).toEqual(a);
  });

  it("a burst has 3–6 arcs of 8–14 points within 14 px of the border", () => {
    const arcs = m.arcBursts(audio, 2.05, 180, 70, viz.mulberry32);
    expect(arcs.length).toBeGreaterThanOrEqual(3);
    expect(arcs.length).toBeLessThanOrEqual(6);
    for (const arc of arcs) {
      const n = arc.points.length / 2;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(14);
      for (let k = 0; k < n; k++) {
        const d = fromBorder(arc.points[2 * k], arc.points[2 * k + 1], 180);
        expect(d).toBeLessThanOrEqual(14 + 1e-3);
        if (k === 0 || k === n - 1) expect(d).toBeLessThan(1e-3); // ends sit on the border
      }
    }
  });

  it("arcs fade to nothing 0.3 s after the beat", () => {
    const at = (t: number) => m.arcBursts(audio, t, 180, 70, viz.mulberry32);
    expect(at(2.0)[0].alpha).toBeCloseTo(0.7, 6);
    expect(at(2.15)[0].alpha).toBeCloseTo(0.35, 6);
    expect(at(2.31)).toEqual([]);
  });

  it("a section start draws the same arcs as the full song", () => {
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3));
    const fromSection = m.arcBursts(section, 0.6, 180, 70, viz.mulberry32);
    const fromFull = m.arcBursts(audio, 2.1, 180, 70, viz.mulberry32);
    expect(fromSection.length).toBe(fromFull.length);
    fromSection.forEach((arc, i) => {
      expect(arc.alpha).toBeCloseTo(fromFull[i].alpha, 9);
      expect(Array.from(arc.points)).toEqual(Array.from(fromFull[i].points));
    });
  });

  it("silence gives the base streak, no arcs, no NaN", () => {
    for (let i = 0; i <= 50; i++) {
      const t = i / 10;
      expect(m.streakLevel(silent.sample(t).loud, 1)).toBe(0.55);
      expect(m.arcBursts(silent, t, 180, 70, viz.mulberry32)).toEqual([]);
      expect(m.starTwinkle(silent, t)).toBe(1);
      const heights = m.barHeights(silent.spectrum(t), 1);
      expect(Array.from(heights).every((h) => h === 0)).toBe(true);
      expect(m.coverEnvelope(silent, t)).toBe(0);
    }
  });

  it("stars twinkle on hits, changing at most 6 times a second", () => {
    expect(m.starTwinkle(audio, 2.0)).toBeCloseTo(1.15, 6);
    expect(m.starTwinkle(audio, 2.1)).toBe(m.starTwinkle(audio, 2.0)); // same 1/6 s step
    expect(m.starTwinkle(audio, 2.6)).toBe(1); // faded after 0.5 s
  });

  it("buildStars makes 900 stars at 100 % and none at 0 %, the same every time", () => {
    const stars = m.buildStars(100, viz.mulberry32);
    expect(stars).toHaveLength(900 * 5);
    expect(m.buildStars(100, viz.mulberry32)).toEqual(stars);
    expect(m.buildStars(0, viz.mulberry32)).toHaveLength(0);
    expect(m.buildStars(200, viz.mulberry32)).toHaveLength(1800 * 5);
    for (let i = 0; i < stars.length; i += 5) {
      const [x, y, depth, size, brightness] = Array.from(stars.slice(i, i + 5));
      expect(x >= 0 && x < 1920 && y >= 0 && y < 1080).toBe(true);
      expect(depth >= 0.2 && depth <= 1).toBe(true);
      expect(size >= 1 && size <= 2.5).toBe(true);
      expect(brightness >= 0.3 && brightness <= 1).toBe(true);
    }
  });

  it("starX drifts 6 px/s for the nearest stars and wraps", () => {
    expect(m.starX(10, 1, 1)).toBe(4);
    expect(m.starX(2, 1, 1)).toBeCloseTo(1916, 9);
    expect(m.starX(500, 0.5, 2)).toBe(494);
  });
});
