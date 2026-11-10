// Night Flight's motion maths (templates/night-flight/assets/flight-motion.js): the clouds'
// travel, the gentle bank, the beat shake, the HUD rings' pulse, turn and ticks, the gauges'
// needles, the level meter, the scene's brightness and the title's fit. All worked out from the
// song time and the audio alone, so any frame can be drawn on its own and a section matches the
// full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Motion = {
  CLOUD_BASE: number;
  CLOUD_PERIOD: number;
  BANK_MAX: number;
  SHAKE_MAX: number;
  PULSE: number;
  NEEDLE_SWEEP: number;
  cloudSpeed: (loud: number, intensity: number) => number;
  loudTable: (frames: ToolkitAnalysis["frames"], fps: number) => Float64Array;
  loudSeconds: (
    table: Float64Array,
    fps: number,
    offset: number,
    t: number,
    before: number,
  ) => number;
  cloudTravel: (songTime: number, loudSeconds: number, intensity: number) => number;
  wrap: (x: number, period: number) => number;
  bankAngle: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => number;
  shakeOffset: (
    env: number,
    intensity: number,
    songTime: number,
    on: boolean,
    mulberry32: VizToolkit["mulberry32"],
  ) => [number, number];
  ringPulse: (env: number) => number;
  innerTurn: (songTime: number) => number;
  tickLengths: (
    values: ArrayLike<number>,
    intensity: number,
    boost: number,
    maxLen: number,
  ) => Float32Array;
  levels: (audio: ToolkitAudio, t: number) => { loud: number; low: number };
  needleAngle: (level: number) => number;
  meterLit: (loud: number, count: number) => number;
  skyLevels: (
    loud: number,
    env: number,
    intensity: number,
  ) => { glow: number; cloud: number; moon: number; hud: number };
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/night-flight/assets/flight-motion.js") as Motion;
const rand = viz.mulberry32;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 14 s: silent for 1 s, beats every second to 10 s, then silence; loudness ramps up and down. */
function frames(): Frame[] {
  return Array.from({ length: 14 * FPS }, (_, i) => {
    const playing = i >= 30 && i < 11 * FPS;
    const level = playing ? 0.4 + 0.5 * Math.abs(Math.sin(i / 40)) : 0;
    return {
      b: Array.from({ length: 32 }, (_, j) => (playing ? Math.max(0, 0.9 - j / 40) * level : 0)),
      l: level,
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
  hits: Array.from({ length: 10 }, (_, i) => [1 + i, i % 2 === 0 ? 1 : 0.4] as [number, number]),
};
const silent: ToolkitAnalysis = {
  ...full,
  frames: full.frames.map((f) => ({ ...f, b: f.b.map(() => 0), l: 0, f: 0 })),
  hits: [],
};

describe("Night Flight motion: the clouds", () => {
  it("fly at 1 + 0.8 × loud × intensity", () => {
    expect(m.cloudSpeed(0, 1)).toBe(1);
    expect(m.cloudSpeed(1, 1)).toBeCloseTo(1.8, 9);
    expect(m.cloudSpeed(0.5, 2)).toBeCloseTo(1.8, 9);
    expect(m.cloudSpeed(5, 9)).toBeLessThanOrEqual(1 + 0.8 * 2);
    expect(m.cloudSpeed(NaN, NaN)).toBe(1);
  });

  it("travel forward from the song time and the loudness so far, at that speed", () => {
    const table = m.loudTable(full.frames, FPS);
    const audio = viz.createAudio(full);
    let last = -Infinity;
    for (let t = 0; t < 14; t += 0.05) {
      const travel = m.cloudTravel(t, m.loudSeconds(table, FPS, 0, t, 0), 1);
      expect(Number.isFinite(travel)).toBe(true);
      expect(travel).toBeGreaterThanOrEqual(last); // never backwards
      last = travel;
    }
    for (const t of [0.5, 3.2, 7.7, 12]) {
      const dt = 0.01;
      const a = m.cloudTravel(t, m.loudSeconds(table, FPS, 0, t, 0), 1);
      const b = m.cloudTravel(t + dt, m.loudSeconds(table, FPS, 0, t + dt, 0), 1);
      const speed = (b - a) / dt / m.CLOUD_BASE;
      expect(speed).toBeCloseTo(m.cloudSpeed(audio.sample(t).loud, 1), 1);
    }
    // silence: the base speed alone
    expect(m.cloudTravel(10, 0, 1)).toBeCloseTo(10 * m.CLOUD_BASE, 9);
  });

  it("a section's clouds are exactly where the full song's are at the same song time", () => {
    const whole = m.loudTable(full.frames, FPS);
    for (const start of [2.5, 5, 9.4]) {
      const cut = sliceAnalysis(full, start, 14);
      expect(cut.loudBefore).toBeGreaterThanOrEqual(0);
      const part = m.loudTable(cut.frames, FPS);
      for (const t of [0, 0.5, 2, 4]) {
        const a = m.cloudTravel(
          start + t,
          m.loudSeconds(part, FPS, cut.offset, t, cut.loudBefore ?? 0),
          1,
        );
        const b = m.cloudTravel(start + t, m.loudSeconds(whole, FPS, 0, start + t, 0), 1);
        expect(a).toBeCloseTo(b, 4);
      }
    }
  });

  it("wraps the travel into one repeat of the cloud pattern", () => {
    expect(m.CLOUD_PERIOD).toBeGreaterThan(0);
    for (const x of [0, 3.5, m.CLOUD_PERIOD, 12345.678, -4]) {
      const w = m.wrap(x, m.CLOUD_PERIOD);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(m.CLOUD_PERIOD);
      expect(Math.abs(((x - w) / m.CLOUD_PERIOD) % 1)).toBeLessThan(1e-9);
    }
    expect(m.wrap(NaN, 10)).toBe(0);
  });
});

describe("Night Flight motion: the bank and the shake", () => {
  it("banks gently (at most 2°) and slowly, from the song time alone", () => {
    expect(m.BANK_MAX).toBeCloseTo((2 * Math.PI) / 180, 9);
    let moved = 0;
    let prev = m.bankAngle(0, rand);
    for (let s = 0; s < 600; s += 0.25) {
      const b = m.bankAngle(s, rand);
      expect(Math.abs(b)).toBeLessThanOrEqual(m.BANK_MAX);
      // slow: under 0.1° a quarter second
      expect(Math.abs(b - prev)).toBeLessThan((0.1 * Math.PI) / 180);
      moved = Math.max(moved, Math.abs(b));
      prev = b;
    }
    expect(moved).toBeGreaterThan(0.5 * m.BANK_MAX);
    expect(m.bankAngle(77.7, rand)).toBe(m.bankAngle(77.7, rand));
    expect(Number.isFinite(m.bankAngle(NaN, rand))).toBe(true);
  });

  it("shakes by at most 6 px on the beat, not at all when off or between beats", () => {
    expect(m.SHAKE_MAX).toBeLessThanOrEqual(6);
    let biggest = 0;
    for (let s = 0; s < 30; s += 0.07) {
      for (const intensity of [0.2, 1, 2]) {
        const [dx, dy] = m.shakeOffset(1, intensity, s, true, rand);
        // whole pixels (a shifted frame then encodes cheaply), never past the cap
        expect(Number.isInteger(dx) && Number.isInteger(dy)).toBe(true);
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(m.SHAKE_MAX + 1e-9);
        biggest = Math.max(biggest, Math.hypot(dx, dy));
      }
    }
    expect(biggest).toBeGreaterThan(3);
    expect(m.shakeOffset(1, 1, 3, false, rand)).toEqual([0, 0]);
    expect(m.shakeOffset(0, 1, 3, true, rand)).toEqual([0, 0]);
    expect(m.shakeOffset(NaN, NaN, NaN, true, rand)).toEqual([0, 0]);
    // the direction comes from the song time: the same for a section
    expect(m.shakeOffset(0.7, 1, 42.1, true, rand)).toEqual(
      m.shakeOffset(0.7, 1, 42.1, true, rand),
    );
    expect(m.shakeOffset(0.7, 1, 42.1, true, rand)).not.toEqual(
      m.shakeOffset(0.7, 1, 42.5, true, rand),
    );
  });
});

describe("Night Flight motion: the HUD", () => {
  it("the rings pulse 1 + 0.04 × the beat", () => {
    expect(m.PULSE).toBe(0.04);
    expect(m.ringPulse(0)).toBe(1);
    expect(m.ringPulse(1)).toBeCloseTo(1.04, 9);
    expect(m.ringPulse(0.5)).toBeCloseTo(1.02, 9);
    expect(m.ringPulse(NaN)).toBe(1);
    expect(m.ringPulse(5)).toBeCloseTo(1.04, 9);
  });

  it("the inner ring turns slowly and steadily", () => {
    const a = m.innerTurn(10);
    const b = m.innerTurn(11);
    expect(b).toBeGreaterThan(a);
    // a full turn takes at least half a minute
    expect(b - a).toBeLessThan((2 * Math.PI) / 30);
    expect(b - a).toBeGreaterThan(0);
    expect(m.innerTurn(10)).toBe(a);
    expect(Number.isFinite(m.innerTurn(NaN))).toBe(true);
  });

  it("ticks: shaped into distinct peaks, never past their length, flat in silence", () => {
    // a loud frame of the unboosted spectrum, ring values as the ring kit gives them
    const loud = Float32Array.from({ length: 72 }, (_, i) => 0.62 + 0.28 * Math.sin(i * 0.7));
    for (const intensity of [0.2, 1, 2]) {
      for (const boost of [1, 2, 4, 8]) {
        for (const x of m.tickLengths(loud, intensity, boost, 40)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(40);
        }
      }
    }
    const h = Array.from(m.tickLengths(loud, 1, 8, 40)).sort((a, b) => a - b);
    expect(h[h.length - 1]).toBeGreaterThan(25);
    expect(h[Math.floor(h.length / 2)]).toBeLessThan(h[h.length - 1] * 0.7);
    // the boost makes them stand taller, never changes their shape
    const h8 = m.tickLengths(loud, 1, 8, 40);
    const h1 = m.tickLengths(loud, 1, 1, 40);
    expect(Math.max(...h8)).toBeGreaterThan(Math.max(...h1));
    expect(h8.indexOf(Math.max(...h8))).toBe(h1.indexOf(Math.max(...h1)));
    // quieter music, shorter ticks
    const quiet = Float32Array.from(loud, (x) => x * 0.3);
    expect(Math.max(...m.tickLengths(quiet, 1, 8, 40))).toBeLessThan(Math.max(...h8));
    expect(Array.from(m.tickLengths(new Float32Array(10), 1, 8, 40))).toEqual(
      new Array(10).fill(0),
    );
    expect(Array.from(m.tickLengths([NaN, NaN], 1, 8, 40))).toEqual([0, 0]);
  });
});

describe("Night Flight motion: gauges, meter and levels", () => {
  it("levels: the loudness and the low end, smoothed over the last moments", () => {
    const audio = viz.createAudio(full);
    const quiet = viz.createAudio(silent);
    for (let t = 0; t < 14; t += 0.1) {
      const l = m.levels(audio, t);
      expect(l.loud).toBeGreaterThanOrEqual(0);
      expect(l.loud).toBeLessThanOrEqual(1);
      expect(l.low).toBeGreaterThanOrEqual(0);
      expect(l.low).toBeLessThanOrEqual(1);
      expect(m.levels(quiet, t)).toEqual({ loud: 0, low: 0 });
    }
    expect(m.levels(audio, 5).loud).toBeGreaterThan(0.3);
    // smoothed: no jumps from one frame to the next
    for (let t = 2; t < 10; t += 1 / FPS) {
      expect(Math.abs(m.levels(audio, t + 1 / FPS).loud - m.levels(audio, t).loud)).toBeLessThan(
        0.08,
      );
    }
  });

  it("a section's levels match the full song's at the same song time", () => {
    const whole = viz.createAudio(full);
    for (const start of [2.5, 6]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (let t = 0; t < 4; t += 0.25) {
        const a = m.levels(section, t);
        const b = m.levels(whole, start + t);
        expect(a.loud).toBeCloseTo(b.loud, 5);
        expect(a.low).toBeCloseTo(b.low, 5);
      }
    }
  });

  it("needles sweep a bounded arc with the level, resting at the low end", () => {
    expect(m.NEEDLE_SWEEP).toBeGreaterThan(1.5);
    expect(m.NEEDLE_SWEEP).toBeLessThan(Math.PI);
    expect(m.needleAngle(0)).toBeCloseTo(-m.NEEDLE_SWEEP, 9);
    expect(m.needleAngle(1)).toBeCloseTo(m.NEEDLE_SWEEP, 9);
    expect(m.needleAngle(0.5)).toBeCloseTo(0, 9);
    expect(m.needleAngle(9)).toBeCloseTo(m.NEEDLE_SWEEP, 9);
    expect(m.needleAngle(NaN)).toBeCloseTo(-m.NEEDLE_SWEEP, 9);
    expect(m.needleAngle(0.7)).toBeGreaterThan(m.needleAngle(0.3));
  });

  it("the level meter lights more LEDs when louder, none in silence", () => {
    expect(m.meterLit(0, 11)).toBe(0);
    expect(m.meterLit(1, 11)).toBe(11);
    expect(m.meterLit(0.5, 11)).toBeGreaterThan(m.meterLit(0.2, 11));
    expect(m.meterLit(NaN, 11)).toBe(0);
    expect(Number.isInteger(m.meterLit(0.37, 11))).toBe(true);
  });

  it("the sky's levels rise with loudness and the beat, are finite and calm in silence", () => {
    const quiet = m.skyLevels(0, 0, 1);
    const loud = m.skyLevels(1, 1, 1);
    for (const k of ["glow", "cloud", "moon", "hud"] as const) {
      expect(quiet[k]).toBeGreaterThan(0.3); // never black
      expect(loud[k]).toBeGreaterThan(quiet[k]);
      expect(loud[k]).toBeLessThanOrEqual(1.8);
      expect(m.skyLevels(5, 5, 9)[k]).toBeLessThanOrEqual(2);
      expect(Number.isFinite(m.skyLevels(NaN, NaN, NaN)[k])).toBe(true);
    }
  });
});

describe("Night Flight motion: the title's fit", () => {
  const measure = (s: string) => [...s].reduce((w, c) => w + (c === " " ? 0.3 : 0.62), 0);

  it("keeps a short title big on one line", () => {
    expect(m.fitTitle("SONG NAME", measure, 1300, 2, 76, 30)).toEqual({
      size: 76,
      lines: ["SONG NAME"],
    });
  });

  it("wraps and shrinks a 60-character title so it fits", () => {
    const title = "THE EXTREMELY LONG NAMED ORCHESTRA AND FRIENDS FEATURING ALL";
    expect(title.length).toBe(60);
    const fit = m.fitTitle(title, measure, 1300, 2, 76, 30);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines.join(" ")).toBe(title);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(1300);
    expect(fit.size).toBeGreaterThanOrEqual(30);
  });

  it("breaks a word too long for the line even at the smallest size", () => {
    const fit = m.fitTitle("X".repeat(60), measure, 600, 2, 76, 20);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(600);
    expect(fit.lines.join("")).toBe("X".repeat(60));
  });
});
