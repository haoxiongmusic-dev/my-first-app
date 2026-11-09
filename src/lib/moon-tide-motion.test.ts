// Moon Tide's motion maths (templates/moon-tide/assets/tide-motion.js): worked out from the song
// time alone (or seeded), so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Bar = {
  angle: number;
  x: number;
  y: number;
  depth: number;
  scale: number;
  height: number;
};
type Ripple = { rx: number; ry: number; alpha: number };
type Dashes = { count: number; params: Float32Array };
type Motion = {
  HORIZON_Y: number;
  RING_CX: number;
  RING_CY: number;
  RING_R: number;
  RING_B: number;
  BAR_COUNT: number;
  BAR_MAX: number;
  BAR_REST: number;
  FAR_SCALE: number;
  SPIN_RATE: number;
  RIPPLE_LIFE: number;
  RIPPLE_STRONG: number;
  RIPPLE_GROW: number;
  RIPPLE_HITS: number;
  MOON_X: number;
  MOON_Y: number;
  MOON_R: number;
  PATH_BOTTOM: number;
  DASH_STRIDE: number;
  LINE_X0: number;
  LINE_X1: number;
  LINE_Y: number;
  spinAngle: (songTime: number, spinPct: number) => number;
  ringPoint: (angle: number) => [number, number, number, number];
  columnCount: (bandPct: number) => number;
  VALLEY: number;
  shapeSpectrum: (spectrum: ArrayLike<number>) => Float32Array;
  columnsToBars: (columns: ArrayLike<number>, count: number) => Float32Array;
  barWeights: (count: number, mulberry32: VizToolkit["mulberry32"]) => Float32Array;
  ringBars: (
    values: ArrayLike<number>,
    weights: ArrayLike<number>,
    spin: number,
    intensity: number,
  ) => Bar[];
  ripples: (
    hits: [number, number][],
    songTime: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => Ripple[];
  driftRipples: (songTime: number) => Ripple[];
  buildDashes: (mulberry32: VizToolkit["mulberry32"]) => Dashes;
  moonDashes: (dashes: Dashes, songTime: number) => Float32Array;
  glowLevel: (loud: number) => number;
  progressX: (fraction: number) => number;
};
const m = require("../../templates/moon-tide/assets/tide-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/**
 * 8 s: silent for the first second, then loud with a bass-heavy spectrum. A hit every half
 * second from 1.0 s, strong and weak in turn.
 */
function frames(): Frame[] {
  return Array.from({ length: 8 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 30 ? Math.max(0, 1 - k / 12) : 0)),
    l: i >= 30 ? 0.8 : 0,
    k: i >= 30 && i % 15 === 0 ? 1 : 0,
    f: i >= 30 ? 0.4 : 0,
  }));
}
function hits(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 14; i++) out.push([1 + i * 0.5, i % 2 === 0 ? 0.9 : 0.3]);
  return out;
}
const full: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 8,
  frames: frames(),
  hits: hits(),
};
const silent: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 3,
  frames: Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
  hits: [],
};

function isFiniteNumber(x: number): boolean {
  return typeof x === "number" && Number.isFinite(x);
}

describe("Moon Tide motion", () => {
  it("lays the scene out as the spec says", () => {
    expect(m.HORIZON_Y).toBe(430);
    expect(m.RING_CX).toBe(960);
    expect(m.RING_CY).toBe(640);
    // a circle of radius 480 lying flat, seen as an ellipse 960 × 180
    expect(m.RING_R).toBe(480);
    expect(m.RING_B * 2).toBe(180);
    expect(m.BAR_COUNT).toBe(120);
    expect(m.BAR_MAX).toBe(140);
    expect(m.SPIN_RATE).toBe(6);
    expect(m.MOON_X).toBe(960);
    expect(m.MOON_Y).toBeLessThan(m.HORIZON_Y / 2);
    expect(m.RIPPLE_LIFE).toBe(3);
  });

  it("places points on the ellipse, the back far and small, the front near and full size", () => {
    const back = m.ringPoint(0);
    expect(back[0]).toBeCloseTo(960);
    expect(back[1]).toBeCloseTo(550);
    expect(back[2]).toBeCloseTo(0);
    expect(back[3]).toBeCloseTo(m.FAR_SCALE);
    const front = m.ringPoint(Math.PI);
    expect(front[0]).toBeCloseTo(960);
    expect(front[1]).toBeCloseTo(730);
    expect(front[2]).toBeCloseTo(1);
    expect(front[3]).toBeCloseTo(1);
    const right = m.ringPoint(Math.PI / 2);
    expect(right[0]).toBeCloseTo(1440);
    expect(right[1]).toBeCloseTo(640);
    const left = m.ringPoint(-Math.PI / 2);
    expect(left[0]).toBeCloseTo(480);
    expect(m.FAR_SCALE).toBeGreaterThan(0.4);
    expect(m.FAR_SCALE).toBeLessThan(0.8);
    // nearer is bigger, all the way round
    let prev = -1;
    for (let a = 0; a <= Math.PI + 1e-9; a += Math.PI / 30) {
      const s = m.ringPoint(a)[3];
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("bar heights: capped at 140 px × intensity, nearer bars taller, sorted back to front", () => {
    const n = m.BAR_COUNT;
    const ones = new Float32Array(n).fill(1);
    const weights = new Float32Array(n).fill(1);
    for (const intensity of [0.2, 1, 2]) {
      const bars = m.ringBars(ones, weights, 0, intensity);
      expect(bars.length).toBe(n);
      for (const b of bars) {
        expect(b.height).toBeLessThanOrEqual(m.BAR_MAX * intensity * b.scale + 1e-6);
        expect(b.height).toBeGreaterThan(0);
      }
      const front = bars.reduce((a, b) => (b.depth > a.depth ? b : a));
      expect(front.height).toBeCloseTo(m.BAR_MAX * intensity * front.scale, 3);
      expect(front.height).toBeGreaterThan(m.BAR_MAX * intensity * 0.99);
    }
    // the same value stands taller nearer the viewer, and the back half comes first
    const bars = m.ringBars(new Float32Array(n).fill(0.7), weights, 0.3, 1);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].depth).toBeGreaterThanOrEqual(bars[i - 1].depth);
      expect(bars[i].height).toBeGreaterThanOrEqual(bars[i - 1].height - 1e-6);
    }
    expect(bars[0].depth).toBeLessThan(0.05);
    expect(bars[n - 1].depth).toBeGreaterThan(0.95);
    // values are squared, so a half-loud band stands a quarter as tall
    const half = m.ringBars(new Float32Array(n).fill(0.5), weights, 0, 1);
    const top = half.reduce((a, b) => (b.depth > a.depth ? b : a));
    expect(top.height).toBeCloseTo(0.25 * m.BAR_MAX * top.scale, 3);
  });

  it("silence: every bar rests as a short stub on the ellipse, never NaN", () => {
    const n = m.BAR_COUNT;
    const weights = m.barWeights(n, viz.mulberry32);
    for (const values of [new Float32Array(n), new Float32Array(n).fill(NaN)]) {
      const bars = m.ringBars(values, weights, NaN, 1);
      for (const b of bars) {
        for (const v of [b.angle, b.x, b.y, b.depth, b.scale, b.height]) {
          expect(isFiniteNumber(v)).toBe(true);
        }
        expect(b.height).toBeCloseTo(m.BAR_REST * b.scale, 6);
        // on the ellipse
        const dx = (b.x - m.RING_CX) / m.RING_R,
          dy = (b.y - m.RING_CY) / m.RING_B;
        expect(dx * dx + dy * dy).toBeCloseTo(1, 6);
      }
    }
    // the whole pipeline from a silent song
    const audio = viz.createAudio(silent, { spectrumCount: 32 });
    const spec = audio.spectrum(1);
    const cols = viz.ringValues(
      viz.smoothSpectrum(spec, 2),
      viz.ringAngles(m.columnCount(40), 360),
      360,
    );
    const bars = m.ringBars(m.columnsToBars(cols, n), weights, m.spinAngle(1, 100), 1);
    for (const b of bars) expect(b.height).toBeCloseTo(m.BAR_REST * b.scale, 6);
    expect(m.ripples(audio.recentHits(1, m.RIPPLE_HITS), 1, viz.mulberry32)).toEqual([]);
    expect(m.glowLevel(NaN)).toBe(m.glowLevel(0));
    expect(isFiniteNumber(m.progressX(NaN))).toBe(true);
  });

  it("seeded bar weights vary from bar to bar and repeat every time", () => {
    const w = m.barWeights(120, viz.mulberry32);
    expect(Array.from(m.barWeights(120, viz.mulberry32))).toEqual(Array.from(w));
    let lo = 1,
      hi = 0;
    for (const x of w) {
      expect(x).toBeGreaterThan(0.5);
      expect(x).toBeLessThanOrEqual(1);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    expect(hi - lo).toBeGreaterThan(0.2);
  });

  it("spin turns the ring 6°/s at 100 %, from the song time only", () => {
    const deg = (r: number) => (r * 180) / Math.PI;
    expect(deg(m.spinAngle(10, 100))).toBeCloseTo(60);
    expect(deg(m.spinAngle(10, 200))).toBeCloseTo(120);
    expect(deg(m.spinAngle(10, 50))).toBeCloseTo(30);
    expect(m.spinAngle(10, 0)).toBe(0);
    expect(m.spinAngle(NaN, 100)).toBe(0);
    expect(m.spinAngle(10, NaN)).toBe(0);
    // the same song time gives the same turn: a section matches the full render
    const section = viz.createAudio(sliceAnalysis(full, 2.5, 6));
    for (const t of [0, 0.7, 2.2]) {
      expect(m.spinAngle(section.songStart + t, 100)).toBeCloseTo(m.spinAngle(2.5 + t, 100), 9);
    }
    // the bars move round the ellipse with it, keeping their order
    const n = m.BAR_COUNT;
    const v = new Float32Array(n).fill(0.6),
      w = new Float32Array(n).fill(1);
    const a = m.ringBars(v, w, 0, 1).map((b) => b.angle);
    const b = m.ringBars(v, w, m.spinAngle(1, 100), 1).map((b) => b.angle);
    const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const sa = a.map(norm).sort((p, q) => p - q),
      sb = b.map(norm).sort((p, q) => p - q);
    const step = (6 * Math.PI) / 180;
    // every bar moved 6°; bars are 3° apart, so compare against the set shifted by 6°
    const shifted = sa.map((x) => norm(x + step)).sort((p, q) => p - q);
    for (let i = 0; i < n; i++) expect(sb[i]).toBeCloseTo(shifted[i], 6);
  });

  it("bands: columns from a fifth of the bars up to all 120; bars read between them", () => {
    expect(m.columnCount(10)).toBe(24);
    expect(m.columnCount(100)).toBe(120);
    expect(m.columnCount(40)).toBe(56);
    const flat = m.columnsToBars(new Float32Array(30).fill(0.4), 120);
    expect(flat.length).toBe(120);
    for (const x of flat) expect(x).toBeCloseTo(0.4, 6);
    // a smoothed bass-only spectrum makes one mountain: highest at the bass, falling off
    // smoothly to both sides (no second peak), the bass at the front at spin 0
    const spec = new Float32Array(32);
    spec[0] = 1;
    spec[1] = 1;
    spec[2] = 0.8;
    const cols = viz.ringValues(
      viz.smoothSpectrum(spec, 2),
      viz.ringAngles(m.columnCount(40), 360),
      360,
    );
    const values = m.columnsToBars(cols, 120);
    let peaks = 0;
    for (let i = 0; i < 120; i++) {
      const prev = values[(i + 119) % 120],
        next = values[(i + 1) % 120];
      if (values[i] > prev + 1e-6 && values[i] >= next) peaks++;
    }
    expect(peaks).toBe(1);
    const bars = m.ringBars(values, new Float32Array(120).fill(1), 0, 1);
    const tallest = bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.depth).toBeGreaterThan(0.95);
  });

  it("shapes a loud, full spectrum into mountains: the loudest bands keep their height", () => {
    // a loud song fills every band; bands well below the loudest drop back to VALLEY
    const loud = Float32Array.from({ length: 32 }, (_, k) => 0.6 + 0.4 * Math.sin(k / 4) ** 2);
    const shaped = m.shapeSpectrum(loud);
    const hi = Math.max(...loud);
    for (let k = 0; k < 32; k++) {
      expect(shaped[k]).toBeLessThanOrEqual(loud[k] + 1e-6);
      expect(shaped[k]).toBeGreaterThanOrEqual(loud[k] * m.VALLEY - 1e-6);
      if (loud[k] === hi) expect(shaped[k]).toBeCloseTo(hi, 6);
      if (loud[k] < hi - 0.25) expect(shaped[k]).toBeCloseTo(loud[k] * m.VALLEY, 6);
    }
    // the order of the bands is kept
    for (let a = 0; a < 32; a++)
      for (let b = 0; b < 32; b++)
        if (loud[a] > loud[b] + 1e-6) expect(shaped[a]).toBeGreaterThan(shaped[b]);
    // a nearly saturated spectrum (0.82..1) still shows clear peaks and valleys
    const full = Float32Array.from({ length: 32 }, (_, k) => 0.82 + 0.18 * Math.sin(k / 4) ** 2);
    const f = m.shapeSpectrum(full);
    expect(Math.min(...f) / Math.max(...f)).toBeLessThan(0.55);
    // silence stays silent; NaN reads as silence
    expect(Array.from(m.shapeSpectrum(new Float32Array(32)))).toEqual(new Array(32).fill(0));
    expect(Array.from(m.shapeSpectrum(new Float32Array(32).fill(NaN))).every((x) => x === 0)).toBe(
      true,
    );
    // a tiny wobble is not stretched into tall mountains
    const wobble = Float32Array.from({ length: 32 }, (_, k) => 0.5 + (k % 2) * 0.02);
    const w = m.shapeSpectrum(wobble);
    expect(Math.max(...w) / Math.min(...w)).toBeLessThan(1.15);
  });

  it("ripples: one per strong beat, growing over 3 s and fading out", () => {
    const strong = m.RIPPLE_STRONG + 0.2;
    // a strong beat 0.1 s, 1 s and 2 s ago, a weak one just now, an old one gone
    const now = 20;
    const list = m.ripples(
      [
        [0, m.RIPPLE_STRONG - 0.2],
        [0.1, strong],
        [1, strong],
        [2, strong],
        [3.2, strong],
      ],
      now,
      viz.mulberry32,
    );
    expect(list.length).toBe(3);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      expect(r.rx).toBeGreaterThanOrEqual(m.RING_R);
      expect(r.rx).toBeLessThanOrEqual(m.RING_R + m.RIPPLE_GROW * 1.2);
      expect(r.ry / r.rx).toBeCloseTo(m.RING_B / m.RING_R, 6);
      expect(r.alpha).toBeGreaterThan(0);
      expect(r.alpha).toBeLessThanOrEqual(1);
      if (i > 0) expect(r.rx).toBeGreaterThan(list[i - 1].rx); // older: wider
    }
    // one ripple through its life: grows steadily, fades to nothing by 3 s
    let prevR = 0,
      prevA = 2;
    for (let age = 0.3; age < 3; age += 0.1) {
      const [r] = m.ripples([[age, strong]], now + age, viz.mulberry32);
      expect(r.rx).toBeGreaterThan(prevR);
      expect(r.alpha).toBeLessThan(prevA);
      prevR = r.rx;
      prevA = r.alpha;
    }
    expect(prevA).toBeLessThan(0.02);
    expect(m.ripples([[3, strong]], now + 3, viz.mulberry32)).toEqual([]);
  });

  it("ripples are seeded by the beat's song frame: a section matches the full song", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 3.2, 7));
    expect(section.songStart).toBe(3.2);
    let seen = 0;
    for (let t = 0; t < 3.5; t += 0.1) {
      const fromSection = m.ripples(
        section.recentHits(t, m.RIPPLE_HITS),
        section.songStart + t,
        viz.mulberry32,
      );
      const fromWhole = m.ripples(
        whole.recentHits(3.2 + t, m.RIPPLE_HITS),
        3.2 + t,
        viz.mulberry32,
      );
      expect(fromSection.length).toBe(fromWhole.length);
      for (let i = 0; i < fromSection.length; i++) {
        expect(fromSection[i].rx).toBeCloseTo(fromWhole[i].rx, 3);
        expect(fromSection[i].alpha).toBeCloseTo(fromWhole[i].alpha, 4);
      }
      seen += fromSection.length;
    }
    expect(seen).toBeGreaterThan(0);
    // two beats of the same strength at the same age differ a little (seeded variety)
    const a = m.ripples([[1, 0.9]], 10, viz.mulberry32)[0];
    const b = m.ripples([[1, 0.9]], 10.5, viz.mulberry32)[0];
    expect(a.rx).not.toBeCloseTo(b.rx, 3);
  });

  it("drifting ripples: a few faint ones, from the time alone", () => {
    for (let s = 0; s < 40; s += 0.37) {
      const list = m.driftRipples(s);
      expect(list).toEqual(m.driftRipples(s));
      for (const r of list) {
        expect(r.rx).toBeGreaterThanOrEqual(m.RING_R);
        expect(r.alpha).toBeGreaterThanOrEqual(0);
        expect(r.alpha).toBeLessThan(0.35);
      }
    }
    expect(m.driftRipples(NaN).every((r) => Number.isFinite(r.rx + r.alpha))).toBe(true);
  });

  it("the moonlight path: dashes under the moon that shimmer slowly, seeded", () => {
    const dashes = m.buildDashes(viz.mulberry32);
    expect(Array.from(m.buildDashes(viz.mulberry32).params)).toEqual(Array.from(dashes.params));
    expect(dashes.count).toBeGreaterThan(15);
    const S = m.DASH_STRIDE;
    let changes = 0;
    for (let s = 5; s < 25; s += 0.25) {
      const a = m.moonDashes(dashes, s);
      const b = m.moonDashes(dashes, s + 1 / FPS);
      expect(a.length).toBe(dashes.count * S);
      let prevY = m.HORIZON_Y;
      for (let i = 0; i < dashes.count; i++) {
        const [x, y, half, thick, level] = Array.from(a.slice(i * S, i * S + 5));
        expect(Math.abs(x - m.MOON_X)).toBeLessThan(20);
        expect(y).toBeGreaterThan(prevY); // top to bottom, below the horizon
        expect(y).toBeLessThanOrEqual(m.PATH_BOTTOM);
        prevY = y;
        expect(half).toBeGreaterThan(0);
        expect(thick).toBeGreaterThan(0);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
        // slowly: little change from one frame to the next
        expect(Math.abs(level - b[i * S + 4])).toBeLessThan(0.06);
        changes += Math.abs(level - b[i * S + 4]);
      }
      // the same song time gives the same dashes
      expect(Array.from(m.moonDashes(dashes, s))).toEqual(Array.from(a));
    }
    expect(changes).toBeGreaterThan(1); // they do shimmer
    // farther dashes (nearer the horizon) are narrower
    const d = m.moonDashes(dashes, 0);
    expect(d[2]).toBeLessThan(d[(dashes.count - 1) * S + 2]);
    expect(Array.from(m.moonDashes(dashes, NaN)).every(Number.isFinite)).toBe(true);
  });

  it("the progress line runs between its ends; the ring glow follows the loudness", () => {
    expect(m.progressX(0)).toBe(m.LINE_X0);
    expect(m.progressX(1)).toBe(m.LINE_X1);
    expect(m.progressX(0.5)).toBeCloseTo((m.LINE_X0 + m.LINE_X1) / 2);
    expect(m.progressX(2)).toBe(m.LINE_X1);
    expect(m.progressX(-1)).toBe(m.LINE_X0);
    expect(m.LINE_X1 - m.LINE_X0).toBeGreaterThan(300);
    expect((m.LINE_X0 + m.LINE_X1) / 2).toBe(960);
    expect(m.LINE_Y).toBeGreaterThan(m.RING_CY + m.RING_B + 150);
    expect(m.LINE_Y).toBeLessThan(1040);
    expect(m.glowLevel(1)).toBeGreaterThan(m.glowLevel(0));
    expect(m.glowLevel(5)).toBe(m.glowLevel(1));
    expect(m.glowLevel(0)).toBeGreaterThan(0);
  });
});
