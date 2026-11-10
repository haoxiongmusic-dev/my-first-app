// Deep Swell's motion maths (templates/deep-swell/assets/swell-motion.js): how high the dot sea
// swells with the low end, how it rolls toward the camera, how bright its crests are, the bokeh
// orbs' slow paths and the logo's pulse. Worked out from the song time alone, so any frame can be
// drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Orb = { x: number; y: number; r: number; alpha: number };
type Motion = {
  H_FULL: number;
  LOW_AGES: number[];
  PULSE_RELEASE: number;
  LOGO_SIZE: number;
  LOGO_PULSE: number;
  ORB_COUNT: number;
  ripplePoints: (bandPct: number) => number;
  baseHeight: (waveHeightPct: number) => number;
  rangeMean: (spectrum: ArrayLike<number>) => number;
  lowLevel: (means: ArrayLike<number>) => number;
  swellHeight: (base: number, low: number, intensity: number) => number;
  flowPhases: (songTime: number, flowPct: number) => [number, number];
  heightAt: (x: number, z: number, phases: [number, number], amp: number) => number;
  rippleShape: (value: number) => number;
  crestGain: (loud: number, intensity: number) => number;
  orbs: (songTime: number, loud: number, mulberry32: VizToolkit["mulberry32"]) => Orb[];
  logoScale: (env: number) => number;
};
const m = require("../../templates/deep-swell/assets/swell-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const LENGTH = 60;

/** A 60 s song: silent for 2 s, then a bass line whose loudness swells and falls every 8 s. */
function song(): ToolkitAnalysis {
  const hits: [number, number][] = [];
  for (let t = 2.03; t < LENGTH; t += 0.5) hits.push([Math.round(t * 1000) / 1000, 0.8]);
  const frames: Frame[] = Array.from({ length: LENGTH * FPS }, (_, i) => {
    const on = i >= 2 * FPS;
    const level = on ? 0.5 + 0.45 * Math.sin((i / FPS) * ((2 * Math.PI) / 8)) : 0;
    return {
      b: Array.from({ length: 32 }, (_, k) => (on ? level * Math.max(0, 1 - k / 20) : 0)),
      l: level,
      k: on && i % 15 === 1 ? 1 : 0,
      f: on ? 0.3 : 0,
    };
  });
  return { version: 1, fps: FPS, bands: 32, duration: LENGTH, frames, hits };
}
const full = song();

function allFinite(xs: ArrayLike<number>): boolean {
  for (let i = 0; i < xs.length; i++) if (!Number.isFinite(xs[i])) return false;
  return true;
}

/** The low level the template works out at time t of an analysis (30–200 Hz, as by default). */
function lowAt(analysis: ToolkitAnalysis, t: number): number {
  const audio = viz.createAudio(analysis, {
    spectrumLow: 30,
    spectrumHigh: 200,
    spectrumCount: 32,
  });
  return m.lowLevel(m.LOW_AGES.map((age) => m.rangeMean(audio.spectrum(t - age))));
}

describe("Deep Swell motion", () => {
  it("is set up as the spec says", () => {
    expect(m.ORB_COUNT).toBe(12);
    expect(m.LOGO_SIZE).toBe(220);
    expect(m.LOGO_PULSE).toBe(0.04);
    expect(m.H_FULL).toBeGreaterThan(0);
    // the low level looks back a little (a smooth swell), well inside a section's lead-in
    expect(Math.max(...m.LOW_AGES)).toBeLessThanOrEqual(1);
    expect(m.LOW_AGES[0]).toBe(0);
  });

  it("wave height: the base from the setting, × (0.5 + 1.2 × low × intensity)", () => {
    expect(m.baseHeight(100)).toBeCloseTo(m.H_FULL, 9);
    expect(m.baseHeight(60)).toBeCloseTo(m.H_FULL * 0.6, 9);
    expect(m.baseHeight(0)).toBe(0);
    expect(m.baseHeight(500)).toBeCloseTo(m.H_FULL, 9);
    expect(m.baseHeight(NaN)).toBe(0);
    const base = m.baseHeight(60);
    expect(m.swellHeight(base, 0, 1)).toBeCloseTo(base * 0.5, 9);
    expect(m.swellHeight(base, 1, 1)).toBeCloseTo(base * 1.7, 9);
    expect(m.swellHeight(base, 0.5, 2)).toBeCloseTo(base * 1.7, 9);
    // grows with the low end
    let last = -1;
    for (let low = 0; low <= 1; low += 0.1) {
      const h = m.swellHeight(base, low, 1);
      expect(h).toBeGreaterThan(last);
      last = h;
    }
    // capped: low and intensity are held to their ranges
    const cap = base * (0.5 + 1.2 * 2);
    expect(m.swellHeight(base, 9, 9)).toBeCloseTo(cap, 9);
    expect(m.swellHeight(base, -3, 1)).toBeCloseTo(base * 0.5, 9);
    expect(m.swellHeight(base, NaN, NaN)).toBeCloseTo(base * 0.5, 9);
  });

  it("the low level: 0 in silence, near 1 in a loud bass line, shaped so loud music still varies", () => {
    expect(m.rangeMean(new Float32Array(32))).toBe(0);
    expect(m.rangeMean(new Float32Array(0))).toBe(0);
    expect(m.rangeMean([0.2, 0.4])).toBeCloseTo(0.3, 9);
    expect(m.lowLevel([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(m.lowLevel([1, 1, 1, 1, 1, 1, 1])).toBeCloseTo(1, 6);
    expect(m.lowLevel([NaN, NaN])).toBe(0);
    expect(m.lowLevel([])).toBe(0);
    // analyzer values sit around 0.5–0.9 in loud music: these must still come out apart
    const ages = m.LOW_AGES.length;
    const at = (v: number) => m.lowLevel(new Array(ages).fill(v));
    expect(at(0.85) - at(0.55)).toBeGreaterThan(0.3);
    expect(at(0.1)).toBeLessThan(0.05);
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      expect(at(v)).toBeGreaterThanOrEqual(last);
      expect(at(v)).toBeLessThanOrEqual(1);
      last = at(v);
    }
    // smoothed: the newest value counts most, older ones less
    const newest = m.lowLevel([1, 0, 0, 0, 0, 0, 0]);
    const oldest = m.lowLevel([0, 0, 0, 0, 0, 0, 1].slice(0, ages));
    expect(newest).toBeGreaterThan(oldest);
    expect(newest).toBeLessThan(1);
  });

  it("silence: the sea lies at its calm rest, no NaN anywhere", () => {
    const low = lowAt(full, 1);
    expect(low).toBe(0);
    const base = m.baseHeight(60);
    const amp = m.swellHeight(base, low, 1);
    expect(amp).toBeCloseTo(base * 0.5, 9);
    const phases = m.flowPhases(1, 40);
    for (let x = -60; x <= 60; x += 7.5)
      for (let z = 0.5; z < 50; z += 3.1) {
        const h = m.heightAt(x, z, phases, amp);
        expect(Number.isFinite(h)).toBe(true);
        expect(Math.abs(h)).toBeLessThanOrEqual(amp + 1e-9);
      }
    expect(m.crestGain(0, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(m.crestGain(NaN, NaN))).toBe(true);
    expect(allFinite(m.flowPhases(NaN, NaN))).toBe(true);
    expect(Number.isFinite(m.heightAt(NaN, 3, m.flowPhases(2, 40), amp))).toBe(true);
    for (const o of m.orbs(NaN, NaN, viz.mulberry32))
      expect(allFinite([o.x, o.y, o.r, o.alpha])).toBe(true);
  });

  it("a loud bass line lifts the sea well above its rest", () => {
    // the 8 s cycle peaks at t = 2, 10, 18 s… and falls to its trough at 6, 14, 22 s…
    const peak = lowAt(full, 18);
    const trough = lowAt(full, 14);
    expect(peak).toBeGreaterThan(0.6);
    expect(trough).toBeLessThan(0.2);
    const base = m.baseHeight(60);
    expect(m.swellHeight(base, peak, 1)).toBeGreaterThan(2 * m.swellHeight(base, trough, 1) - 1e-9);
  });

  it("rolls toward the camera with time only: the same song time, the same sea", () => {
    const amp = 1;
    const a = m.flowPhases(37.25, 40);
    expect(m.flowPhases(37.25, 40)).toEqual(a);
    // phases stay small numbers however long the song (precise on every GPU)
    for (const t of [0, 1, 59.9, 600, 3599.97]) {
      for (const p of m.flowPhases(t, 100)) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(2 * Math.PI + 1e-9);
      }
    }
    // it moves over time, and Flow speed 0 freezes the roll
    expect(m.heightAt(3, 12, m.flowPhases(10, 40), amp)).not.toBeCloseTo(
      m.heightAt(3, 12, m.flowPhases(10.5, 40), amp),
      3,
    );
    expect(m.flowPhases(10, 0)).toEqual(m.flowPhases(55, 0));
    // faster flow, further in the same time
    const slow = m.flowPhases(1, 20)[0],
      fast = m.flowPhases(1, 80)[0];
    expect(fast).toBeGreaterThan(slow);
    // the main swell travels toward the camera: a crest moves to a smaller z as time goes on
    const crestZ = (t: number, from: number, to: number) => {
      let best = 0,
        bestH = -Infinity;
      for (let z = from; z < to; z += 0.02) {
        const h = m.heightAt(0, z, m.flowPhases(t, 40), amp);
        if (h > bestH) {
          bestH = h;
          best = z;
        }
      }
      return best;
    };
    const z0 = crestZ(20, 10, 40);
    const z1 = crestZ(20.3, z0 - 4, z0 + 4);
    expect(z1).toBeLessThan(z0);
    expect(z0 - z1).toBeLessThan(3); // slow: a calm roll, not a jump
  });

  it("the spectrum ripple: flat in silence, capped, shaped so loud values still vary", () => {
    expect(m.rippleShape(0)).toBe(0);
    expect(m.rippleShape(NaN)).toBe(0);
    expect(m.rippleShape(1)).toBeCloseTo(1, 9);
    expect(m.rippleShape(5)).toBeCloseTo(1, 9);
    expect(m.rippleShape(0.2)).toBeLessThan(0.05);
    expect(m.rippleShape(0.9) - m.rippleShape(0.6)).toBeGreaterThan(0.3);
    // Bands: a fifth of the full count up to all of it
    expect(m.ripplePoints(100)).toBe(64);
    expect(m.ripplePoints(10)).toBe(Math.round(64 * 0.2));
    expect(m.ripplePoints(500)).toBe(64);
    expect(m.ripplePoints(-4)).toBe(Math.round(64 * 0.2));
  });

  it("crests brighten with loudness, capped", () => {
    expect(m.crestGain(1, 1)).toBeGreaterThan(m.crestGain(0, 1) * 1.8);
    let last = -1;
    for (let l = 0; l <= 1; l += 0.1) {
      expect(m.crestGain(l, 1)).toBeGreaterThan(last);
      last = m.crestGain(l, 1);
    }
    expect(m.crestGain(9, 9)).toBeCloseTo(m.crestGain(1, 2), 9);
    expect(m.crestGain(1, 2)).toBeLessThanOrEqual(2);
  });

  it("bokeh orbs: 12, seeded, slow, brightness 0.6 + 0.4 × loud", () => {
    const quiet = m.orbs(30, 0, viz.mulberry32);
    const loud = m.orbs(30, 1, viz.mulberry32);
    expect(quiet).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      const q = quiet[i],
        l = loud[i];
      expect([q.x, q.y, q.r]).toEqual([l.x, l.y, l.r]);
      expect(q.alpha).toBeCloseTo(l.alpha * 0.6, 9);
      expect(l.alpha).toBeGreaterThan(0);
      expect(l.alpha).toBeLessThanOrEqual(1);
      expect(q.r).toBeGreaterThanOrEqual(40);
      expect(q.r).toBeLessThanOrEqual(200);
      // somewhere on (or just off) the frame
      expect(q.x).toBeGreaterThanOrEqual(-q.r - 1);
      expect(q.x).toBeLessThanOrEqual(1920 + q.r + 1);
      expect(q.y).toBeGreaterThan(-q.r);
      expect(q.y).toBeLessThan(1080 + q.r);
    }
    // the same song time places them the same; they differ from one another
    expect(m.orbs(30, 0.4, viz.mulberry32)).toEqual(m.orbs(30, 0.4, viz.mulberry32));
    expect(new Set(quiet.map((o) => Math.round(o.x))).size).toBeGreaterThan(8);
    // they drift slowly: under 40 px in a second (away from the wrap at the frame's edges)
    const later = m.orbs(31, 0, viz.mulberry32);
    for (let i = 0; i < 12; i++) {
      const d = Math.hypot(later[i].x - quiet[i].x, later[i].y - quiet[i].y);
      if (d < 1000) expect(d).toBeLessThan(40);
    }
    // loudness is held to 0..1
    expect(m.orbs(30, 7, viz.mulberry32)).toEqual(loud);
  });

  it("orbs and the sea in a section match the full song at the same song time", () => {
    for (const start of [13.4, 31.0]) {
      const part = sliceAnalysis(full, start, start + 10);
      const pa = viz.createAudio(part);
      const fa = viz.createAudio(full);
      for (let t = 0; t < 10; t += 0.37) {
        const ps = pa.songStart + t,
          fs = fa.songStart + start + t;
        expect(ps).toBeCloseTo(fs, 9);
        const so = m.orbs(ps, pa.sample(t).loud, viz.mulberry32);
        const fo = m.orbs(fs, fa.sample(start + t).loud, viz.mulberry32);
        for (let i = 0; i < so.length; i++) {
          expect([so[i].x, so[i].y, so[i].r]).toEqual([fo[i].x, fo[i].y, fo[i].r]);
          expect(so[i].alpha).toBeCloseTo(fo[i].alpha, 9);
        }
        expect(m.flowPhases(ps, 40)).toEqual(m.flowPhases(fs, 40));
        expect(lowAt(part, t)).toBeCloseTo(lowAt(full, start + t), 9);
      }
    }
  });

  it("the logo pulses 1 + 0.04 × the beat envelope, capped", () => {
    expect(m.logoScale(0)).toBe(1);
    expect(m.logoScale(1)).toBeCloseTo(1.04, 9);
    expect(m.logoScale(0.5)).toBeCloseTo(1.02, 9);
    expect(m.logoScale(5)).toBeCloseTo(1.04, 9);
    expect(m.logoScale(-1)).toBe(1);
    expect(m.logoScale(NaN)).toBe(1);
    expect(m.PULSE_RELEASE).toBeGreaterThan(0);
    expect(m.PULSE_RELEASE).toBeLessThanOrEqual(0.4);
  });
});
