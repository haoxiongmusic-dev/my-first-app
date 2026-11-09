// World Orbit's motion maths (templates/world-orbit/assets/orbit-motion.js): worked out from the
// song time alone (or seeded), so any frame can be drawn on its own and a section matches the
// full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Item = { k: number; a: number };
type Layout = { size: number; copies: number; items: Item[] };
type Pose = {
  x: number;
  y: number;
  depth: number;
  scale: number;
  bright: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
};
type Placed = Pose & { k: number };
type Leak = { strength: number; x: number; y: number; angle: number; width: number };
type Motion = {
  PLANET_X: number;
  PLANET_Y: number;
  PLANET_R: number;
  RING_RX: number;
  RING_RY: number;
  RING_TILT: number;
  RAY_FULL: number;
  RAY_MAX: number;
  SPIN_SECONDS: number;
  ORBIT_DEFAULT: number;
  ORBIT_MIN: number;
  ORBIT_MAX: number;
  PULSE_RELEASE: number;
  BEAT_SCALE: number;
  LEAK_PERIOD: number;
  DRIFT_LIMIT: number;
  TITLE_SIZE: number;
  VALLEY: number;
  orbitSeconds: (x: unknown) => number;
  orbitPhase: (songTime: number, orbitSeconds: number) => number;
  titleLayout: (widths: ArrayLike<number>, sepWidth: number) => Layout;
  letterPose: (theta: number) => Pose;
  placeLetters: (layout: Layout, songTime: number, orbitSeconds: number) => Placed[];
  planetSpin: (songTime: number) => number;
  planetScale: (env: number, on: boolean) => number;
  rayCount: (bandPct: number) => number;
  rayWeights: (count: number, mulberry32: VizToolkit["mulberry32"]) => Float32Array;
  rayLengths: (
    values: ArrayLike<number>,
    weights: ArrayLike<number>,
    intensity: number,
  ) => Float32Array;
  rayLevel: (loud: number) => number;
  glowLevel: (loud: number) => number;
  lightLeak: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => Leak;
  drift: (songTime: number) => [number, number];
};
const m = require("../../templates/world-orbit/assets/orbit-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const TAU = Math.PI * 2;

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

/** Rough Montserrat ExtraBold advances (em) for capitals. */
const WIDTH: Record<string, number> = { " ": 0.28, "-": 0.42, I: 0.32, M: 0.92, W: 1.08 };
function widthsOf(text: string): number[] {
  return Array.from(text).map((ch) => WIDTH[ch] ?? 0.72);
}
const SEP = 1.1; // " • " in em

function allFinite(xs: ArrayLike<number>): boolean {
  for (let i = 0; i < xs.length; i++) if (!Number.isFinite(xs[i])) return false;
  return true;
}
function wrap(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}
/** The pose's position back in the ring's own (untilted) frame, relative to the planet. */
function untilt(p: Pose): [number, number] {
  const dx = p.x - m.PLANET_X,
    dy = p.y - m.PLANET_Y;
  const c = Math.cos(-m.RING_TILT),
    s = Math.sin(-m.RING_TILT);
  return [dx * c - dy * s, dx * s + dy * c];
}

describe("World Orbit motion", () => {
  it("lays the scene out as the spec says", () => {
    expect(m.PLANET_R).toBe(230);
    expect(m.PLANET_X).toBe(960); // centred
    expect(Math.abs(m.PLANET_Y - 540)).toBeLessThan(60);
    expect(m.RING_RX).toBe(420);
    expect(m.RING_RY).toBe(70);
    // slightly tilted
    expect(Math.abs(m.RING_TILT)).toBeGreaterThan(0.02);
    expect(Math.abs(m.RING_TILT)).toBeLessThan(0.25);
    expect(m.RAY_FULL).toBe(180);
    expect(m.RAY_MAX).toBe(60);
    expect(m.SPIN_SECONDS).toBe(60);
    expect(m.ORBIT_DEFAULT).toBe(12);
    expect(m.ORBIT_MIN).toBe(6);
    expect(m.ORBIT_MAX).toBe(30);
    expect(m.BEAT_SCALE).toBe(0.03);
    expect(m.LEAK_PERIOD).toBe(14);
    expect(m.DRIFT_LIMIT).toBe(40);
  });

  it("orbit time: clamped to 6–30 s, 12 s when missing", () => {
    expect(m.orbitSeconds(12)).toBe(12);
    expect(m.orbitSeconds(6)).toBe(6);
    expect(m.orbitSeconds(30)).toBe(30);
    expect(m.orbitSeconds(2)).toBe(6);
    expect(m.orbitSeconds(99)).toBe(30);
    expect(m.orbitSeconds("20")).toBe(20);
    expect(m.orbitSeconds(NaN)).toBe(12);
    expect(m.orbitSeconds(undefined)).toBe(12);
  });

  it("the orbit turns once every orbitSeconds, from the song time", () => {
    for (const secs of [6, 12, 30]) {
      expect(m.orbitPhase(0, secs)).toBe(0);
      expect(m.orbitPhase(secs / 4, secs)).toBeCloseTo(TAU / 4, 9);
      for (const s of [0.5, 3.3, 17, 200.25]) {
        const a = m.orbitPhase(s, secs);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(TAU);
        // one full turn later it is back where it was
        expect(wrap(m.orbitPhase(s + secs, secs) - a + 1e-9)).toBeLessThan(1e-6);
      }
    }
    // the orbit time setting is clamped here too; nonsense gives the default speed
    expect(m.orbitPhase(3, 1)).toBeCloseTo(m.orbitPhase(3, 6), 9);
    expect(m.orbitPhase(3, NaN)).toBeCloseTo(m.orbitPhase(3, 12), 9);
    expect(m.orbitPhase(NaN, 12)).toBe(0);
    // a long song stays exact (no drift from adding up)
    expect(m.orbitPhase(3600 + 3, 12)).toBeCloseTo(m.orbitPhase(3, 12), 6);
  });

  it("letters sit on the tilted 420 × 70 ellipse: front low, big and bright; back high, small and dim", () => {
    for (let i = 0; i < 72; i++) {
      const theta = (i / 72) * TAU;
      const p = m.letterPose(theta);
      expect(allFinite([p.x, p.y, p.depth, p.scale, p.bright, p.ux, p.uy, p.vx, p.vy])).toBe(true);
      const [rx, ry] = untilt(p);
      expect(rx).toBeCloseTo(m.RING_RX * Math.sin(theta), 6);
      expect(ry).toBeCloseTo(m.RING_RY * Math.cos(theta), 6);
      expect(p.depth).toBeCloseTo(Math.cos(theta), 9);
      // letters face outward, as on a real ring: in front they read left to right; round the
      // back they are seen from behind (mirrored); they turn edge-on at the sides
      const along = p.ux * Math.cos(m.RING_TILT) + p.uy * Math.sin(m.RING_TILT);
      if (Math.cos(theta) > 1e-9) expect(along).toBeGreaterThan(0);
      if (Math.cos(theta) < -1e-9) expect(along).toBeLessThan(0);
      // and stand upright (their vertical axis points down the screen)
      expect(p.vy).toBeGreaterThan(0.9);
      expect(p.bright).toBeGreaterThan(0);
      expect(p.bright).toBeLessThanOrEqual(1);
    }
    const front = m.letterPose(0),
      back = m.letterPose(Math.PI),
      side = m.letterPose(Math.PI / 2);
    expect(front.depth).toBe(1);
    expect(back.depth).toBeCloseTo(-1, 9);
    expect(front.y).toBeGreaterThan(m.PLANET_Y + 60); // in front: lower on the screen
    expect(back.y).toBeLessThan(m.PLANET_Y - 60); // behind: higher, hidden by the planet
    expect(Math.abs(back.x - m.PLANET_X)).toBeLessThan(m.PLANET_R);
    expect(front.scale).toBeGreaterThan(back.scale * 1.2);
    expect(front.bright).toBeGreaterThan(back.bright * 2);
    // at the sides a letter turns edge-on: narrow, but never gone
    const width = (p: Pose) => Math.hypot(p.ux, p.uy);
    expect(width(front)).toBeCloseTo(1, 6);
    expect(width(side)).toBeLessThan(0.2);
    expect(width(side)).toBeGreaterThan(0.03);
    expect(side.x).toBeGreaterThan(m.PLANET_X + m.PLANET_R + 100); // well clear of the planet
  });

  it("a short title is repeated with a separator all round the ring", () => {
    const layout = m.titleLayout(widthsOf("T-REX"), SEP);
    expect(layout.size).toBe(m.TITLE_SIZE);
    expect(layout.copies).toBeGreaterThanOrEqual(3);
    // each copy is the title's letters then one separator (k = -1)
    expect(layout.items.length).toBe(layout.copies * 6);
    for (let c = 0; c < layout.copies; c++) {
      const ks = layout.items.slice(c * 6, c * 6 + 6).map((it) => it.k);
      expect(ks).toEqual([0, 1, 2, 3, 4, -1]);
    }
    // the copies are spaced evenly round the whole turn
    const firsts = layout.items.filter((it) => it.k === 0).map((it) => it.a);
    const step = TAU / layout.copies;
    for (let c = 1; c < firsts.length; c++) expect(firsts[c] - firsts[c - 1]).toBeCloseTo(step, 6);
    // the first copy is centred on the front at the start
    const first = layout.items.slice(0, 5).map((it) => it.a);
    expect((first[0] + first[4]) / 2).toBeCloseTo(0, 1);
  });

  it("letters keep their spacing and never overlap; the whole layout fits one turn", () => {
    for (const text of ["T-REX", "SONG NAME", "MIDNIGHT DRIVE THROUGH THE CITY", "W".repeat(60)]) {
      const widths = widthsOf(text);
      const layout = m.titleLayout(widths, SEP);
      const items = layout.items;
      for (let i = 1; i < items.length; i++) {
        expect(items[i].a).toBeGreaterThan(items[i - 1].a);
      }
      const span = items[items.length - 1].a - items[0].a;
      expect(span).toBeLessThan(TAU);
      // neighbouring letters are at least their half widths apart (in ring pixels)
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1],
          b = items[i];
        if (a.k < 0 || b.k < 0) continue;
        const need = ((widths[a.k] + widths[b.k]) / 2) * layout.size;
        expect((b.a - a.a) * m.RING_RX + 1e-6).toBeGreaterThanOrEqual(need);
      }
    }
  });

  it("a 60-character title shrinks to fit one turn instead of piling up into mush", () => {
    const text = "THE EXTREMELY LONG NAMED SONG OF THE MIDNIGHT CITY LIGHTS OK";
    expect(text.length).toBe(60);
    const layout = m.titleLayout(widthsOf(text), SEP);
    expect(layout.copies).toBe(1);
    expect(layout.size).toBeLessThan(m.TITLE_SIZE);
    expect(layout.size).toBeGreaterThan(45); // still big enough to read at the front
    expect(layout.items.length).toBe(61);
    // the widest possible title still fits (smaller, never overlapping)
    const widest = m.titleLayout(widthsOf("W".repeat(60)), SEP);
    expect(widest.size).toBeGreaterThan(30);
    // nothing to show for an empty title
    expect(m.titleLayout([], SEP).items).toEqual([]);
    expect(allFinite([m.titleLayout([NaN, 0.5], NaN).size])).toBe(true);
  });

  it("placing letters is time-only: the same song time gives the same ring, a section matches", () => {
    const layout = m.titleLayout(widthsOf("T-REX"), SEP);
    const a = m.placeLetters(layout, 12.3, 12);
    expect(a.length).toBe(layout.items.length);
    expect(m.placeLetters(layout, 12.3, 12)).toEqual(a);
    // sorted from the back to the front, so nearer letters are drawn over farther ones
    for (let i = 1; i < a.length; i++) expect(a[i].depth).toBeGreaterThanOrEqual(a[i - 1].depth);
    // a section starting at 2.5 s draws what the full song draws at the same song time
    const section = viz.createAudio(sliceAnalysis(full, 2.5, 6));
    for (const t of [0, 0.4, 1.9]) {
      expect(m.placeLetters(layout, section.songStart + t, 12)).toEqual(
        m.placeLetters(layout, 2.5 + t, 12),
      );
    }
    // the letters move right to left across the front (like a ticker), smoothly
    const frontmost = (ps: Placed[]) =>
      ps.filter((p) => p.k === 2).reduce((a, b) => (b.depth > a.depth ? b : a));
    const now = frontmost(m.placeLetters(layout, 0, 12));
    const next = frontmost(m.placeLetters(layout, 1 / FPS, 12));
    expect(next.x).toBeLessThan(now.x);
    expect(now.x - next.x).toBeLessThan(12);
    // at the start the first copy is centred at the front, reading left to right
    const start = m.placeLetters(layout, 0, 12).filter((p) => p.depth > 0.98);
    expect(start.length).toBeGreaterThan(0);
  });

  it("the planet turns once a minute and pulses 1 + 0.03 × the beat envelope", () => {
    expect(m.planetSpin(0)).toBe(0);
    expect(m.planetSpin(15)).toBeCloseTo(Math.PI / 2, 9);
    expect(m.planetSpin(60)).toBeCloseTo(0, 6);
    expect(m.planetSpin(NaN)).toBe(0);
    // slowly: a frame moves the surface under a pixel at the centre
    expect(m.planetSpin(1 / FPS) * m.PLANET_R).toBeLessThan(1);
    expect(m.planetScale(0, true)).toBe(1);
    expect(m.planetScale(1, true)).toBeCloseTo(1.03, 9);
    expect(m.planetScale(0.5, true)).toBeCloseTo(1.015, 9);
    expect(m.planetScale(1, false)).toBe(1);
    expect(m.planetScale(NaN, true)).toBe(1);
    expect(m.planetScale(9, true)).toBeCloseTo(1.03, 9);
    // the envelope jumps on a kick and falls away
    const audio = viz.createAudio(full);
    const onBeat = viz.beatEnvelope(audio, 2.0, m.PULSE_RELEASE);
    const after = viz.beatEnvelope(audio, 2.15, m.PULSE_RELEASE);
    expect(onBeat).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(onBeat);
  });

  it("rays: 180 at Bands 100 %, capped at 60 px × intensity, shaped so a loud song still varies", () => {
    expect(m.rayCount(100)).toBe(180);
    expect(m.rayCount(10)).toBe(36);
    expect(m.rayCount(NaN)).toBe(180);
    const w = m.rayWeights(180, viz.mulberry32);
    expect(w.length).toBe(180);
    expect(Array.from(m.rayWeights(180, viz.mulberry32))).toEqual(Array.from(w)); // seeded
    expect(Math.min(...w)).toBeGreaterThan(0.2);
    expect(Math.max(...w)).toBeLessThanOrEqual(1);
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(0.4);
    for (const intensity of [0.2, 1, 2]) {
      const len = m.rayLengths(
        new Float32Array(180).fill(1),
        new Float32Array(180).fill(1),
        intensity,
      );
      for (const x of len) expect(x).toBeLessThanOrEqual(m.RAY_MAX * intensity + 1e-6);
      expect(Math.max(...len)).toBeCloseTo(m.RAY_MAX * intensity, 3);
    }
    expect(Math.max(...m.rayLengths(new Float32Array(180).fill(9), w, 50))).toBeLessThanOrEqual(
      m.RAY_MAX * 2 + 1e-6,
    );
    // a loud, nearly full spectrum (the analyzer's 0.5–1, boosted): clearly different lengths
    const angles = viz.ringAngles(180, 360);
    const spec = Float32Array.from({ length: 32 }, (_, k) => 0.85 + 0.15 * Math.sin(k / 3) ** 2);
    const len = m.rayLengths(viz.ringValues(spec, angles, 360), w, 1);
    const sorted = Array.from(len).sort((a, b) => a - b);
    expect(sorted[18] / sorted[161]).toBeLessThan(0.45); // 10th vs 90th percentile
    // faint, and brighter with the loudness
    expect(m.rayLevel(0)).toBeGreaterThan(0);
    expect(m.rayLevel(0)).toBeLessThan(0.35);
    expect(m.rayLevel(1)).toBeGreaterThan(m.rayLevel(0) * 2);
    expect(m.rayLevel(1)).toBeLessThanOrEqual(1);
    expect(m.rayLevel(NaN)).toBe(m.rayLevel(0));
  });

  it("the light leak sweeps across about every 14 s, seeded by the song time", () => {
    let shown = 0;
    const perSlot = new Map<number, number>();
    let prevOn = false;
    for (let f = 0; f < 140 * FPS; f++) {
      const s = f / FPS;
      const leak = m.lightLeak(s, viz.mulberry32);
      expect(m.lightLeak(s, viz.mulberry32)).toEqual(leak);
      expect(allFinite([leak.strength, leak.x, leak.y, leak.angle, leak.width])).toBe(true);
      expect(leak.strength).toBeGreaterThanOrEqual(0);
      expect(leak.strength).toBeLessThanOrEqual(1);
      const on = leak.strength > 0;
      if (on) {
        shown++;
        // a warm diagonal streak on the right side of the frame
        expect(leak.x).toBeGreaterThan(800);
        expect(Math.abs(leak.angle)).toBeGreaterThan(0.4);
        expect(Math.abs(leak.angle)).toBeLessThan(1.2);
        expect(leak.width).toBeGreaterThan(20);
      }
      if (on && !prevOn) {
        const slot = Math.floor(s / m.LEAK_PERIOD);
        perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
      }
      prevOn = on;
    }
    // one sweep in each 14 s, each lasting a few seconds
    expect(perSlot.size).toBe(10);
    for (const n of perSlot.values()) expect(n).toBe(1);
    expect(shown / (140 * FPS)).toBeGreaterThan(0.15);
    expect(shown / (140 * FPS)).toBeLessThan(0.45);
    // it moves smoothly across while it shows
    const a = m.lightLeak(20, viz.mulberry32);
    // the song opens calm: no streak in the first few seconds
    for (let s = 0; s < 4; s += 0.1) expect(m.lightLeak(s, viz.mulberry32).strength).toBe(0);
    expect(a.strength).toBeGreaterThanOrEqual(0);
    // a section shows exactly the full render's streak at the same song time
    const section = viz.createAudio(sliceAnalysis(full, 3.2, 7));
    for (let t = 0; t < 3.8; t += 1 / FPS) {
      expect(m.lightLeak(section.songStart + t, viz.mulberry32)).toEqual(
        m.lightLeak(3.2 + t, viz.mulberry32),
      );
    }
    expect(m.lightLeak(NaN, viz.mulberry32).strength).toBe(0);
    expect(m.lightLeak(-1, viz.mulberry32).strength).toBe(0);
  });

  it("the camera drifts slowly: under 40 px in any minute, small and smooth", () => {
    for (let s = 0; s < 900; s += 1.7) {
      const a = m.drift(s),
        b = m.drift(s + 60),
        c = m.drift(s + 1 / FPS);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(m.DRIFT_LIMIT);
      expect(Math.hypot(a[0], a[1])).toBeLessThanOrEqual(m.DRIFT_LIMIT);
      expect(Math.hypot(c[0] - a[0], c[1] - a[1])).toBeLessThan(0.05);
    }
    // it does move over a few minutes
    let far = 0;
    for (let s = 0; s < 300; s += 5) far = Math.max(far, Math.hypot(...m.drift(s)));
    expect(far).toBeGreaterThan(8);
    expect(allFinite(m.drift(NaN))).toBe(true);
  });

  it("silence: a calm frame, rays at rest, never NaN", () => {
    const audio = viz.createAudio(silent, { spectrumCount: 32 });
    const env = viz.beatEnvelope(audio, 1, m.PULSE_RELEASE);
    expect(env).toBe(0);
    expect(m.planetScale(env, true)).toBe(1);
    const spec = audio.spectrum(1);
    const angles = viz.ringAngles(180, 360);
    const len = m.rayLengths(
      viz.ringValues(spec, angles, 360),
      m.rayWeights(180, viz.mulberry32),
      1,
    );
    expect(Array.from(len)).toEqual(new Array(180).fill(0));
    expect(
      Array.from(m.rayLengths(new Float32Array(180).fill(NaN), new Float32Array(180).fill(1), 1)),
    ).toEqual(new Array(180).fill(0));
    const layout = m.titleLayout(widthsOf("SONG NAME"), SEP);
    for (const p of m.placeLetters(layout, NaN, NaN)) {
      expect(allFinite([p.x, p.y, p.depth, p.scale, p.bright, p.ux, p.uy, p.vx, p.vy])).toBe(true);
    }
    expect(m.glowLevel(NaN)).toBe(m.glowLevel(0));
    expect(m.glowLevel(0)).toBeGreaterThan(0.4); // the planet still shows in silence
    expect(m.glowLevel(1)).toBeGreaterThan(m.glowLevel(0)); // and lights up when loud
    expect(m.glowLevel(5)).toBe(m.glowLevel(1));
  });
});
