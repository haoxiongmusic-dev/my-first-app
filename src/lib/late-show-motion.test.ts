// Late Show's motion maths (templates/late-show/assets/show-motion.js): the grid's scroll, the
// horizon spectrum, the sun's breathing stripes, the screen's flicker, dips and roll line, the
// cover's glitch, the camera's drift and the title's fit. All worked out from the song time and
// the audio alone (or seeded by a beat's song frame), so any frame can be drawn on its own and a
// section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis, SECTION_PREROLL } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Beat = { frame: number; age: number; strength: number };
type Glitch = { active: boolean; slices: [number, number, number][]; split: number };
type Motion = {
  SEED: number;
  GRID_BASE: number;
  SPEC_MAX: number;
  STRONG: number;
  GLITCH_TIME: number;
  DIP_RELEASE: number;
  LOOKBACK: number;
  FLICKER_MAX: number;
  FLICKER_RATE: number;
  DRIFT_MAX: number;
  gridSpeed: (loud: number, intensity: number) => number;
  loudTable: (frames: ToolkitAnalysis["frames"], fps: number) => Float64Array;
  loudSeconds: (table: Float64Array, fps: number, offset: number, t: number) => number;
  gridTravel: (songTime: number, loudSeconds: number, intensity: number) => number;
  strongBeats: (audio: ToolkitAudio, t: number) => Beat[];
  glitch: (beats: Beat[], mulberry32: VizToolkit["mulberry32"]) => Glitch;
  hitEnvelope: (beats: Beat[]) => number;
  screenDip: (env: number, intensity: number) => number;
  rollLine: (beats: Beat[]) => { pos: number; alpha: number };
  flicker: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => number;
  horizonValues: (V: VizToolkit, spectrum: ArrayLike<number>, count: number) => Float32Array;
  horizonHeights: (values: ArrayLike<number>, intensity: number, boost: number) => Float32Array;
  sunGaps: (songTime: number, env: number) => [number, number][];
  sceneLevels: (
    loud: number,
    env: number,
    intensity: number,
  ) => { grid: number; horizon: number; glow: number; sun: number };
  cameraDrift: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => [number, number];
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/late-show/assets/show-motion.js") as Motion;
const rand = viz.mulberry32;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 14 s: silent for 1 s, beats every second (strong and weak in turn) to 10 s, then silence. */
function hitTimes(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) out.push([1 + i, i % 2 === 0 ? 1 : 0.3]);
  return out.map(([t, s]) => [Math.round(t * FPS) / FPS, s]);
}
function frames(): Frame[] {
  return Array.from({ length: 14 * FPS }, (_, i) => {
    const playing = i >= 30 && i < 11 * FPS;
    return {
      b: Array.from({ length: 32 }, (_, j) => (playing ? Math.max(0, 0.9 - j / 40) : 0)),
      l: playing ? 0.8 : 0,
      k: 0,
      f: playing ? 0.3 : 0,
    };
  });
}
const full: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 14,
  frames: frames(),
  hits: hitTimes(),
};
const STRONG_TIMES = hitTimes()
  .filter(([, s]) => s >= 0.5)
  .map(([t]) => t);

describe("Late Show motion: the grid", () => {
  it("scrolls at 1 + 0.6 × loud × intensity, never faster", () => {
    expect(m.gridSpeed(0, 1)).toBe(1);
    expect(m.gridSpeed(1, 1)).toBeCloseTo(1.6, 9);
    expect(m.gridSpeed(0.5, 2)).toBeCloseTo(1.6, 9);
    expect(m.gridSpeed(5, 9)).toBeLessThanOrEqual(1 + 0.6 * 2);
    expect(m.gridSpeed(NaN, NaN)).toBe(1);
  });

  it("travels forward from the song time and the loudness so far, at that speed", () => {
    const table = m.loudTable(full.frames, FPS);
    const audio = viz.createAudio(full);
    let last = -Infinity;
    for (let t = 0; t < 14; t += 0.05) {
      const travel = m.gridTravel(t, m.loudSeconds(table, FPS, 0, t), 1);
      expect(Number.isFinite(travel)).toBe(true);
      expect(travel).toBeGreaterThanOrEqual(last); // never backwards
      last = travel;
    }
    for (const t of [0.5, 3.2, 7.7, 12]) {
      const dt = 0.01;
      const a = m.gridTravel(t, m.loudSeconds(table, FPS, 0, t), 1);
      const b = m.gridTravel(t + dt, m.loudSeconds(table, FPS, 0, t + dt), 1);
      const speed = (b - a) / dt / m.GRID_BASE;
      expect(speed).toBeCloseTo(m.gridSpeed(audio.sample(t).loud, 1), 1);
    }
    // silence: the base speed alone
    expect(m.gridTravel(10, 0, 1)).toBeCloseTo(10 * m.GRID_BASE, 9);
  });

  it("a section's grid runs at the same speed as the full song's", () => {
    const whole = m.loudTable(full.frames, FPS);
    const cut = sliceAnalysis(full, 5, 14);
    const part = m.loudTable(cut.frames, FPS);
    const dt = 0.5;
    for (const t of [0.5, 2, 4]) {
      const a =
        m.loudSeconds(part, FPS, cut.offset, t + dt) - m.loudSeconds(part, FPS, cut.offset, t);
      const b = m.loudSeconds(whole, FPS, 0, 5 + t + dt) - m.loudSeconds(whole, FPS, 0, 5 + t);
      expect(a).toBeCloseTo(b, 6);
    }
  });
});

describe("Late Show motion: beats, glitch, dips and flicker", () => {
  it("strong beats: by song frame, within the lookback, newest first", () => {
    const audio = viz.createAudio(full);
    const list = m.strongBeats(audio, 3.05);
    expect(list.map((b) => b.frame)).toEqual([90]);
    expect(list[0].age).toBeCloseTo(0.05, 6);
    expect(list.every((b) => b.strength >= m.STRONG)).toBe(true);
    // weak beats don't count, and the lookback is short and fits a section's pre-roll
    expect(m.strongBeats(audio, 4.05)).toEqual([]);
    expect(m.strongBeats(audio, 0.5)).toEqual([]);
    expect(m.LOOKBACK).toBeLessThanOrEqual(SECTION_PREROLL - 0.5);
    // a beat at exactly this moment counts already
    expect(m.strongBeats(audio, 3)[0]).toMatchObject({ frame: 90, age: 0 });
  });

  it("the cover glitches for at most 0.12 s after a strong beat, in 2-4 seeded slices", () => {
    expect(m.GLITCH_TIME).toBeLessThanOrEqual(0.12);
    const audio = viz.createAudio(full);
    for (const beat of STRONG_TIMES) {
      const on = m.glitch(m.strongBeats(audio, beat + 0.02), rand);
      expect(on.active).toBe(true);
      expect(on.slices.length).toBeGreaterThanOrEqual(2);
      expect(on.slices.length).toBeLessThanOrEqual(4);
      for (const [y0, y1, dx] of on.slices) {
        expect(y0).toBeGreaterThanOrEqual(0);
        expect(y1).toBeLessThanOrEqual(1);
        expect(y1).toBeGreaterThan(y0);
        expect(Math.abs(dx)).toBeLessThanOrEqual(0.12);
        expect(Math.abs(dx)).toBeGreaterThan(0);
      }
      expect(m.glitch(m.strongBeats(audio, beat + 0.02), rand)).toEqual(on);
      expect(m.glitch(m.strongBeats(audio, beat + m.GLITCH_TIME + 0.01), rand).active).toBe(false);
    }
    // different beats glitch differently
    const a = m.glitch(m.strongBeats(audio, STRONG_TIMES[0] + 0.02), rand);
    const b = m.glitch(m.strongBeats(audio, STRONG_TIMES[1] + 0.02), rand);
    expect(a.slices).not.toEqual(b.slices);
    // silence: no glitch
    expect(m.glitch([], rand)).toEqual({ active: false, slices: [], split: 0 });
  });

  it("a section glitches, dips and flickers exactly like the full song at the same song time", () => {
    const whole = viz.createAudio(full);
    for (const start of [2.5, 4.9]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (let t = 0; t < 4; t += 1 / FPS) {
        const a = m.strongBeats(section, t);
        const b = m.strongBeats(whole, start + t);
        expect(a.map((x) => x.frame)).toEqual(b.map((x) => x.frame));
        expect(m.glitch(a, rand)).toEqual(m.glitch(b, rand));
        expect(m.hitEnvelope(a)).toBeCloseTo(m.hitEnvelope(b), 6);
        expect(m.flicker(section.songStart + t, rand)).toBe(m.flicker(start + t, rand));
      }
    }
  });

  it("the screen dips on strong hits (release 0.2 s) and a roll line passes", () => {
    expect(m.DIP_RELEASE).toBe(0.2);
    const audio = viz.createAudio(full);
    const at = m.strongBeats(audio, 3);
    expect(m.hitEnvelope(at)).toBeCloseTo(1, 6);
    expect(m.hitEnvelope(m.strongBeats(audio, 3.2))).toBeCloseTo(Math.exp(-1), 2);
    expect(m.screenDip(1, 1)).toBeGreaterThan(0.05);
    expect(m.screenDip(1, 2)).toBeLessThanOrEqual(0.15);
    expect(m.screenDip(0, 1)).toBe(0);
    const roll = m.rollLine(m.strongBeats(audio, 3.05));
    expect(roll.alpha).toBeGreaterThan(0);
    expect(roll.pos).toBeGreaterThan(0);
    expect(roll.pos).toBeLessThan(1);
    expect(m.rollLine([])).toEqual({ pos: 0, alpha: 0 });
    expect(m.hitEnvelope([])).toBe(0);
  });

  it("flickers subtly (at most 4 %) and slowly (at most 6 changes a second)", () => {
    expect(m.FLICKER_MAX).toBeLessThanOrEqual(0.04);
    expect(m.FLICKER_RATE).toBeLessThanOrEqual(6);
    let changes = 0;
    let prev = m.flicker(100, rand);
    const seen = new Set<number>();
    for (let i = 1; i <= 600; i++) {
      const f = m.flicker(100 + i / 60, rand);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(m.FLICKER_MAX);
      if (f !== prev) changes++;
      prev = f;
      seen.add(f);
    }
    expect(changes).toBeLessThanOrEqual(6 * 10 + 1);
    expect(seen.size).toBeGreaterThan(10); // it does change
    expect(m.flicker(42.123, rand)).toBe(m.flicker(42.123, rand));
  });
});

describe("Late Show motion: the horizon, the sun and the levels", () => {
  it("horizon values: the bass at both ends, mirrored, the top band in the middle", () => {
    const spectrum = Float32Array.from({ length: 20 }, (_, i) => 1 - i / 19);
    const v = m.horizonValues(viz, spectrum, 40);
    expect(v.length).toBe(40);
    expect(v[0]).toBeCloseTo(1, 6);
    expect(v[39]).toBeCloseTo(1, 6);
    expect(v[19]).toBeLessThan(0.1);
    for (let i = 0; i < 20; i++) expect(v[i]).toBeCloseTo(v[39 - i], 6);
    const odd = m.horizonValues(viz, spectrum, 41);
    expect(odd.length).toBe(41);
    for (let i = 0; i < 20; i++) expect(odd[i]).toBeCloseTo(odd[40 - i], 6);
  });

  it("horizon heights: shaped into peaks, at most 120 px, flat in silence", () => {
    expect(m.SPEC_MAX).toBe(120);
    // a loud frame of the unboosted spectrum (T-REX at 1:15 reads 0.35-0.9)
    const loud = Float32Array.from({ length: 60 }, (_, i) => 0.62 + 0.28 * Math.sin(i * 0.7));
    for (const intensity of [0.2, 1, 2]) {
      for (const boost of [1, 2, 4, 8]) {
        for (const x of m.horizonHeights(loud, intensity, boost)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(120);
        }
      }
    }
    // distinct peaks: the tallest well above the median
    const h = Array.from(m.horizonHeights(loud, 1, 1)).sort((a, b) => a - b);
    expect(h[h.length - 1]).toBeGreaterThan(50);
    expect(h[Math.floor(h.length / 2)]).toBeLessThan(h[h.length - 1] * 0.6);
    // the same shape at every boost; the boost only makes it stand taller
    const h8 = m.horizonHeights(loud, 1, 8);
    const h1 = m.horizonHeights(loud, 1, 1);
    expect(Math.max(...h8)).toBeGreaterThan(Math.max(...h1));
    const peakAt = (a: Float32Array) => a.indexOf(Math.max(...a));
    expect(peakAt(h8)).toBe(peakAt(h1));
    // quieter music, lower peaks
    const quiet = Float32Array.from(loud, (x) => x * 0.4);
    expect(Math.max(...m.horizonHeights(quiet, 1, 1))).toBeLessThan(Math.max(...h1) * 0.5);
    expect(Math.max(...m.horizonHeights(quiet, 1, 8))).toBeGreaterThan(
      Math.max(...m.horizonHeights(quiet, 1, 1)),
    );
    expect(Array.from(m.horizonHeights(new Float32Array(50), 1, 8))).toEqual(new Array(50).fill(0));
    expect(Array.from(m.horizonHeights([NaN, NaN, NaN], 1, 8))).toEqual([0, 0, 0]);
  });

  it("the sun's stripes breathe on the beat and drift slowly down", () => {
    const calm = m.sunGaps(10, 0);
    const beat = m.sunGaps(10, 1);
    expect(calm.length).toBeGreaterThanOrEqual(4);
    expect(beat.length).toBe(calm.length);
    for (let i = 0; i < calm.length; i++) {
      expect(beat[i][1] - beat[i][0]).toBeGreaterThan(calm[i][1] - calm[i][0]);
      for (const g of [calm[i], beat[i]]) {
        expect(g[0]).toBeGreaterThanOrEqual(0);
        expect(g[1]).toBeLessThanOrEqual(1);
      }
    }
    expect(m.sunGaps(10.5, 0)).not.toEqual(calm);
    expect(m.sunGaps(10, 0)).toEqual(calm);
  });

  it("levels rise with loudness and the beat, are finite and calm in silence", () => {
    const quiet = m.sceneLevels(0, 0, 1);
    const loud = m.sceneLevels(1, 1, 1);
    for (const k of ["grid", "horizon", "glow", "sun"] as const) {
      expect(quiet[k]).toBeGreaterThan(0.2); // never black
      expect(loud[k]).toBeGreaterThan(quiet[k]);
      expect(loud[k]).toBeLessThanOrEqual(1.6);
      expect(Number.isFinite(m.sceneLevels(NaN, NaN, NaN)[k])).toBe(true);
    }
  });

  it("the camera drifts slowly by at most 1°, from the song time alone", () => {
    expect(m.DRIFT_MAX).toBeCloseTo(Math.PI / 180, 9);
    let moved = 0;
    let prev = m.cameraDrift(0, rand);
    for (let s = 0; s < 600; s += 0.25) {
      const d = m.cameraDrift(s, rand);
      expect(Math.abs(d[0])).toBeLessThanOrEqual(m.DRIFT_MAX);
      expect(Math.abs(d[1])).toBeLessThanOrEqual(m.DRIFT_MAX);
      // slow: under 0.05° a quarter second
      expect(Math.abs(d[0] - prev[0])).toBeLessThan((0.05 * Math.PI) / 180);
      moved = Math.max(moved, Math.abs(d[0]));
      prev = d;
    }
    expect(moved).toBeGreaterThan(0.3 * m.DRIFT_MAX);
    expect(m.cameraDrift(77.7, rand)).toEqual(m.cameraDrift(77.7, rand));
  });
});

describe("Late Show motion: the title's fit", () => {
  // a fake font: every character 0.62 em wide, a space 0.3 em
  const measure = (s: string) => [...s].reduce((w, c) => w + (c === " " ? 0.3 : 0.62), 0);

  it("keeps a short title big on one line", () => {
    const fit = m.fitTitle("SONG NAME", measure, 1400, 2, 150, 40);
    expect(fit).toEqual({ size: 150, lines: ["SONG NAME"] });
  });

  it("wraps and shrinks a 60-character title so it fits", () => {
    const title = "THE EXTREMELY LONG NAMED ORCHESTRA AND FRIENDS FEATURING ALL";
    expect(title.length).toBe(60);
    const fit = m.fitTitle(title, measure, 1400, 2, 150, 40);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines.join(" ")).toBe(title);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(1400);
    expect(fit.size).toBeLessThan(150);
    expect(fit.size).toBeGreaterThanOrEqual(40);
  });

  it("breaks a word too long for the line even at the smallest size", () => {
    const fit = m.fitTitle("X".repeat(60), measure, 600, 2, 150, 20);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(600);
    expect(fit.lines.join("")).toBe("X".repeat(60));
  });

  it("an empty title has no lines", () => {
    expect(m.fitTitle("   ", measure, 1400, 2, 150, 40).lines).toEqual([]);
  });
});
