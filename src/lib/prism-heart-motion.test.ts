// Prism Heart's geometry and motion maths (templates/prism-heart/assets/prism-motion.js):
// the crystal is the same every time, and everything moves from the song time alone.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Audio = ReturnType<VizToolkit["createAudio"]>;
type Rand = (seed: number) => () => number;
type Motion = {
  PULSE_RELEASE: number;
  RING: { x: number; y: number; r: number; max: number };
  buildCrystal: (mulberry32: Rand) => {
    positions: Float32Array;
    normals: Float32Array;
    edges: Float32Array;
  };
  turnAngles: (songTime: number, spinPct: number) => { y: number; x: number };
  crystalScale: (env: number, intensity: number) => number;
  edgeFlash: (audio: Audio, t: number) => number;
  sheenShift: (loud: number) => number;
  glowLevel: (loud: number, intensity: number) => number;
  ringLengths: (values: ArrayLike<number>, intensity: number) => Float32Array;
  ringCount: (V: VizToolkit, pct: number) => number;
  dotSize: (thicknessPct: number) => number;
  buildBokeh: (mulberry32: Rand) => Float32Array;
  bokehAt: (disc: ArrayLike<number>, songTime: number) => [number, number];
  bokehLevel: (loud: number) => number;
  grainSeed: (songTime: number) => number;
};
const m = require("../../templates/prism-heart/assets/prism-motion.js") as Motion;

const DEG = Math.PI / 180;
const FPS = 30;
type Frame = ToolkitAnalysis["frames"][number];
function analysis(seconds: number, hits: [number, number][]): ToolkitAnalysis {
  const frames: Frame[] = Array.from({ length: seconds * FPS }, () => ({
    b: new Array(32).fill(0),
    l: 0,
    k: 0,
    f: 0,
  }));
  return { version: 1, fps: FPS, bands: 32, duration: seconds, frames, hits };
}

describe("Prism Heart crystal", () => {
  const c = m.buildCrystal(viz.mulberry32);
  const tri = (i: number) =>
    [0, 1, 2].map((v) => Array.from(c.positions.slice(9 * i + 3 * v, 9 * i + 3 * v + 3)));

  it("is the same every time: 24 triangles, about 3.1 units tall", () => {
    expect(m.buildCrystal(viz.mulberry32)).toEqual(c);
    expect(c.positions).toHaveLength(24 * 9);
    expect(c.normals).toHaveLength(24 * 9);
    expect(c.edges).toHaveLength(24 * 9);
    const ys = Array.from(c.positions).filter((_, i) => i % 3 === 1);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(height).toBeGreaterThanOrEqual(3.0);
    expect(height).toBeLessThanOrEqual(3.2);
  });

  it("is closed: every edge is shared by exactly two triangles", () => {
    const key = (p: number[]) => p.map((v) => v.toFixed(5)).join(",");
    const count = new Map<string, number>();
    for (let i = 0; i < 24; i++) {
      const [a, b, d] = tri(i).map(key);
      for (const [p, q] of [
        [a, b],
        [b, d],
        [d, a],
      ]) {
        const e = [p, q].sort().join("|");
        count.set(e, (count.get(e) ?? 0) + 1);
      }
    }
    expect([...count.values()].every((n) => n === 2)).toBe(true);
  });

  it("has unit face normals pointing outward", () => {
    for (let i = 0; i < 24; i++) {
      const pts = tri(i);
      const centroid = [0, 1, 2].map((k) => (pts[0][k] + pts[1][k] + pts[2][k]) / 3);
      for (let v = 0; v < 3; v++) {
        const n = Array.from(c.normals.slice(9 * i + 3 * v, 9 * i + 3 * v + 3));
        expect(Math.hypot(...n)).toBeCloseTo(1, 5);
        expect(n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2]).toBeGreaterThan(0);
      }
    }
  });

  it("shows its facet edges but hides the diagonals of the side faces", () => {
    expect(Array.from(c.edges).every((v) => v === 0 || v === 1)).toBe(true);
    let hidden = 0;
    for (let i = 0; i < 24; i++) {
      const e = [0, 1, 2].map((v) => Array.from(c.edges.slice(9 * i + 3 * v, 9 * i + 3 * v + 3)));
      const fixed = [0, 1, 2].filter((k) => e.every((vert) => vert[k] === 1));
      expect(fixed.length).toBeLessThanOrEqual(1);
      hidden += fixed.length;
    }
    expect(hidden).toBe(12); // one diagonal per side triangle; none on the tips
  });
});

describe("Prism Heart motion", () => {
  it("turns by time only, and stands still at 0 % spin", () => {
    expect(m.turnAngles(1, 100).y).toBeCloseTo(12 * DEG, 9);
    for (const t of [0, 3.3, 100]) expect(m.turnAngles(t, 0).y).toBe(0);
    expect(m.turnAngles(0, 100).x).toBe(0);
    for (let i = 0; i < 50; i++) {
      expect(Math.abs(m.turnAngles(i * 0.7, 100).x)).toBeLessThanOrEqual(6 * DEG + 1e-12);
    }
  });

  it("the crystal pulses up to 5 % per unit of intensity", () => {
    expect(m.crystalScale(1, 1)).toBeCloseTo(1.05, 9);
    expect(m.crystalScale(0, 2)).toBe(1);
  });

  it("edges flash on a hit and fade out over 0.4 s, the same in a section", () => {
    const full = analysis(4, [[2.0, 1]]);
    const audio = viz.createAudio(full);
    expect(m.edgeFlash(audio, 2.0)).toBeCloseTo(0.8, 6);
    expect(m.edgeFlash(audio, 2.2)).toBeCloseTo(0.4, 6);
    expect(m.edgeFlash(audio, 2.41)).toBe(0);
    expect(m.edgeFlash(audio, 1.9)).toBe(0);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3));
    expect(m.edgeFlash(section, 0.6)).toBeCloseTo(m.edgeFlash(audio, 2.1), 6);
  });

  it("glow and sheen follow loudness", () => {
    expect(m.glowLevel(1, 2)).toBe(1);
    expect(m.glowLevel(0, 1)).toBe(0.5);
    expect(m.sheenShift(0.9)).toBeCloseTo(0.3, 9);
    expect(m.bokehLevel(1)).toBeCloseTo(1.1, 9);
  });

  it("ring bars follow the square of the value and cap at 110 px", () => {
    expect(Array.from(m.ringLengths([0, 0.5, 1], 1))).toEqual([0, 27.5, 110]);
    expect(Array.from(m.ringLengths([0, 0.5, 1], 2))).toEqual([0, 55, 110]);
  });

  it("the ring at full length stays in the frame and clear of the text", () => {
    const { x, y, r, max } = m.RING;
    expect(x - r - max).toBeGreaterThan(140 + 560); // the text block ends at 700
    expect(x + r + max).toBeLessThan(1920);
    expect(y - r - max).toBeGreaterThan(0);
    expect(y + r + max).toBeLessThan(1080);
  });

  it("Bands and Band thickness map to points and dot sizes", () => {
    expect(m.ringCount(viz, 50)).toBe(viz.bandsToRingCount(50, 160));
    expect(m.dotSize(10)).toBe(2);
    expect(m.dotSize(100)).toBe(8);
  });

  it("the bokeh is the same every time and drifts by time only", () => {
    const b = m.buildBokeh(viz.mulberry32);
    expect(m.buildBokeh(viz.mulberry32)).toEqual(b);
    expect(b).toHaveLength(40 * 6);
    for (let i = 0; i < 40; i++) {
      const [x, y, r, mix, phase, speed] = Array.from(b.slice(6 * i, 6 * i + 6));
      expect(x >= 0 && x <= 1920 && y >= 0 && y <= 1080).toBe(true);
      expect(r >= 30 && r <= 160).toBe(true);
      expect(mix >= 0 && mix <= 1).toBe(true);
      expect(phase >= 0 && phase <= 2 * Math.PI).toBe(true);
      expect(speed >= 0.05 && speed <= 0.15).toBe(true);
    }
    const disc = b.slice(0, 6);
    expect(m.bokehAt(disc, 12.5)).toEqual(m.bokehAt(disc, 12.5));
    expect(m.bokehAt(disc, 12.5)).not.toEqual(m.bokehAt(disc, 40));
  });

  it("grain changes at most 6 times a second", () => {
    expect(m.grainSeed(0.99)).toBe(5);
    expect(m.grainSeed(1.0)).toBe(6);
  });

  it("silence gives no flash and no bars, with no NaN", () => {
    const silent = viz.createAudio(analysis(3, []), { spectrumCount: 30 });
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      expect(m.edgeFlash(silent, t)).toBe(0);
      const lens = Array.from(m.ringLengths(silent.spectrum(t), 1));
      expect(lens.every((v) => v === 0)).toBe(true);
      expect(m.crystalScale(viz.beatEnvelope(silent, t, m.PULSE_RELEASE), 1)).toBe(1);
    }
  });
});
