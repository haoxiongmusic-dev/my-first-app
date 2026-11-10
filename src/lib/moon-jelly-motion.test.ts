// Moon Jelly's motion maths (templates/moon-jelly/assets/jelly-motion.js): where each jellyfish
// is (a slow seeded drift upward, wrapping softly), its swim on the beat (the bell contracts and
// relaxes, pushing it up a little), the tentacles trailing behind as delayed sine chains, the glow
// from the loudness and each jellyfish's own band, the ripple's wobble and the title line. Every
// jellyfish's state at a time is worked out from that time and the beats alone, so any frame can
// be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis, SECTION_PREROLL } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Rand = VizToolkit["mulberry32"];
type Beat = { age: number; strength: number; frame: number };
type Slot = { tier: string; x: number; width: number; band: number };
type State = {
  x: number;
  y: number;
  width: number;
  contraction: number;
  w: number;
  h: number;
  lift: number;
  lean: number;
  yaw: number;
  pitch: number;
  fade: number;
};
type Trail = { delays: number[]; dx: number[]; dy: number[]; w: number[] };
type Motion = {
  SEED: number;
  MIN_JELLIES: number;
  MAX_JELLIES: number;
  DEFAULT_JELLIES: number;
  HORIZON: number;
  LOOKBACK: number;
  MAX_HITS: number;
  ATTACK: number;
  RELAX: number;
  PUSH_MAX: number;
  SINK_TO: number;
  TRAIL: number;
  WOBBLE_MAX: number;
  RIPPLE_RELEASE: number;
  SHAFT_MAX: number;
  LEAN_RATE: number;
  SLOTS: Slot[];
  jellyCount: (value: unknown) => number;
  beatsAt: (audio: ToolkitAudio, t: number) => Beat[];
  contraction: (beats: Beat[], delay: number, intensity: number) => number;
  bellScale: (c: number) => { w: number; h: number };
  lift: (beats: Beat[], delay: number, intensity: number) => number;
  jellyAt: (
    slot: number,
    songTime: number,
    beats: Beat[],
    intensity: number,
    mulberry32: Rand,
    delay?: number,
  ) => State;
  trail: (
    slot: number,
    songTime: number,
    beats: Beat[],
    intensity: number,
    mulberry32: Rand,
    samples: number,
  ) => Trail;
  chainPose: (
    trail: Trail,
    radiusPx: number,
    anchorX: number,
    anchorZ: number,
    links: number,
    sway: { amp: number; freq: number; phase: number; wave: number },
    songTime: number,
    energy: number,
  ) => Float32Array;
  bandLevels: (spectrum: ArrayLike<number>, intensity: number, boost: number) => Float32Array;
  glowLevel: (loud: number, level: number, contraction: number, intensity: number) => number;
  wobblePx: (env: number, on: boolean, intensity: number) => number;
  shaftSway: (songTime: number) => number;
  titleLine: (artist: string, title: string) => string;
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
  titleLines: (
    artist: string,
    title: string,
    measure: (s: string) => number,
    maxWidth: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/moon-jelly/assets/jelly-motion.js") as Motion;
const rand = viz.mulberry32;

type AFrame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 14 s: silent for 1 s, then music with hits every half second (every other one strong). */
function frames(): AFrame[] {
  return Array.from({ length: 14 * FPS }, (_, i) => {
    const playing = i >= 30 && i < 11 * FPS;
    const level = playing ? 0.4 + 0.5 * Math.abs(Math.sin(i / 40)) : 0;
    return {
      b: Array.from({ length: 32 }, (_, j) => (playing ? Math.max(0, 0.9 - j / 40) * level : 0)),
      l: level,
      k: playing && i % 15 === 0 ? 1 : 0,
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
  hits: Array.from(
    { length: 20 },
    (_, i) => [1 + i * 0.5, i % 2 === 0 ? 1 : 0.4] as [number, number],
  ),
};
const silent: ToolkitAnalysis = {
  ...full,
  frames: full.frames.map((f) => ({ ...f, b: f.b.map(() => 0), l: 0, k: 0, f: 0 })),
  hits: [],
};
const one = (age: number, strength = 1): Beat[] => [{ age, strength, frame: 300 }];

describe("Moon Jelly motion: the school", () => {
  it("has 3 to 14 jellyfish, 9 by default", () => {
    expect([m.MIN_JELLIES, m.MAX_JELLIES, m.DEFAULT_JELLIES]).toEqual([3, 14, 9]);
    expect(m.jellyCount(9)).toBe(9);
    expect(m.jellyCount(1)).toBe(3);
    expect(m.jellyCount(40)).toBe(14);
    expect(m.jellyCount(7.6)).toBe(8);
    expect(m.jellyCount("12")).toBe(12);
    expect(m.jellyCount(NaN)).toBe(9);
    expect(m.jellyCount(undefined)).toBe(9);
  });

  it("puts two big ones in front at the lower left and right, then mid and far ones", () => {
    expect(m.SLOTS).toHaveLength(14);
    const [a, b] = m.SLOTS;
    expect([a.tier, b.tier]).toEqual(["front", "front"]);
    expect(a.x).toBeLessThan(640);
    expect(b.x).toBeGreaterThan(1280);
    for (const s of [a, b]) {
      expect(s.width).toBeGreaterThanOrEqual(400);
      expect(s.width).toBeLessThanOrEqual(500);
    }
    const tiers = m.SLOTS.map((s) => s.tier);
    expect(tiers.filter((t) => t === "front")).toHaveLength(2);
    expect(tiers.filter((t) => t === "mid").length).toBeGreaterThanOrEqual(3);
    expect(tiers.filter((t) => t === "far").length).toBeGreaterThanOrEqual(6);
    // the fewest (3) still have a mid-sized one; far ones are small
    expect(m.SLOTS[2].tier).toBe("mid");
    for (const s of m.SLOTS.filter((x) => x.tier === "far")) expect(s.width).toBeLessThan(160);
    for (const s of m.SLOTS.filter((x) => x.tier === "mid")) {
      expect(s.width).toBeGreaterThan(160);
      expect(s.width).toBeLessThan(300);
    }
  });

  it("starts the front ones low in the frame, below the horizon", () => {
    expect(m.HORIZON).toBeCloseTo(0.45 * 1080, -1);
    for (const i of [0, 1]) {
      for (const s of [0, 60, 90, 180]) {
        const j = m.jellyAt(i, s, [], 1, rand);
        expect(j.y).toBeGreaterThan(m.HORIZON);
        expect(j.y).toBeLessThan(1080);
      }
    }
  });
});

describe("Moon Jelly motion: beats", () => {
  it("lists the last LOOKBACK seconds of beats with their song frames, the same in a section", () => {
    const whole = viz.createAudio(full);
    const list = m.beatsAt(whole, 4.6);
    expect(list[0]).toMatchObject({ frame: 135, strength: 0.4 });
    expect(list[0].age).toBeCloseTo(0.1, 6);
    for (const b of list) expect(b.age).toBeLessThanOrEqual(m.LOOKBACK);
    expect(m.LOOKBACK).toBeLessThanOrEqual(SECTION_PREROLL - 0.5);
    expect(m.LOOKBACK).toBeGreaterThanOrEqual(m.SINK_TO + m.TRAIL);
    expect(m.MAX_HITS).toBeGreaterThanOrEqual(m.LOOKBACK / 0.15);
    expect(m.beatsAt(whole, 0.5)).toEqual([]);
    for (const start of [2.5, 6, 9.1]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (let t = 0; t < 4; t += 0.37) {
        const a = m.beatsAt(section, t);
        const b = m.beatsAt(whole, start + t);
        expect(a.map((x) => x.frame)).toEqual(b.map((x) => x.frame));
        for (let i = 0; i < a.length; i++) expect(a[i].age).toBeCloseTo(b[i].age, 5);
      }
    }
  });
});

describe("Moon Jelly motion: the swim", () => {
  it("contracts the bell on a beat (narrower, taller) and relaxes over 0.6 s", () => {
    expect(m.RELAX).toBeCloseTo(0.6, 9);
    expect(m.ATTACK).toBeLessThanOrEqual(0.12);
    expect(m.contraction([], 0, 1)).toBe(0);
    const peak = m.contraction(one(m.ATTACK), 0, 1);
    expect(peak).toBeGreaterThan(0.9);
    expect(m.contraction(one(0.02), 0, 1)).toBeLessThan(peak);
    expect(m.contraction(one(m.ATTACK + 0.3), 0, 1)).toBeLessThan(peak);
    expect(m.contraction(one(m.ATTACK + 0.3), 0, 1)).toBeGreaterThan(0);
    expect(m.contraction(one(m.ATTACK + m.RELAX), 0, 1)).toBe(0);
    expect(m.contraction(one(2), 0, 1)).toBe(0);
    // a weaker beat, a smaller squeeze; never past 1
    expect(m.contraction(one(m.ATTACK, 0.4), 0, 1)).toBeLessThan(peak);
    const many = Array.from({ length: 8 }, (_, i) => ({
      age: 0.05 + i * 0.02,
      strength: 1,
      frame: i,
    }));
    expect(m.contraction(many, 0, 2)).toBeLessThanOrEqual(1);
    // the bell: narrower and taller while contracted, its rest shape at 0
    expect(m.bellScale(0)).toEqual({ w: 1, h: 1 });
    const s = m.bellScale(1);
    expect(s.w).toBeLessThan(0.9);
    expect(s.w).toBeGreaterThan(0.7);
    expect(s.h).toBeGreaterThan(1.08);
    expect(s.h).toBeLessThan(1.3);
    // delayed: the same beat seen `delay` seconds ago
    expect(m.contraction(one(0.5), 0.5 - m.ATTACK, 1)).toBeCloseTo(peak, 9);
    expect(m.contraction(one(0.1), 0.2, 1)).toBe(0); // it had not happened yet
  });

  it("pushes the jellyfish up a little on each beat, bounded, sinking back after", () => {
    expect(m.lift([], 0, 1)).toBe(0);
    const at = (age: number) => m.lift(one(age), 0, 1);
    expect(at(0)).toBe(0);
    expect(at(0.3)).toBeGreaterThan(0);
    expect(at(0.7)).toBeGreaterThan(at(0.3));
    expect(at(m.SINK_TO)).toBe(0);
    expect(at(m.SINK_TO - 1)).toBeLessThan(at(1));
    // a steady run of strong beats lifts it at most PUSH_MAX bell widths
    const run = Array.from({ length: 33 }, (_, i) => ({ age: i * 0.15, strength: 1, frame: i }));
    expect(m.lift(run, 0, 2)).toBeLessThanOrEqual(m.PUSH_MAX);
    expect(m.PUSH_MAX).toBeLessThanOrEqual(0.4);
    // … and in steady music (a beat every half second) each new beat still visibly lifts it more
    const steady = Array.from({ length: 10 }, (_, i) => ({
      age: 0.7 + i * 0.5,
      strength: 1,
      frame: i,
    }));
    const more = [
      { age: 0.7, strength: 1, frame: 99 },
      ...steady.map((b) => ({ ...b, age: b.age + 0.5 })),
    ];
    const before = steady.map((b) => ({ ...b, age: b.age + 0.5 }));
    expect(m.lift(more, 0, 1) - m.lift(before, 0, 1)).toBeGreaterThan(0.01);
  });

  it("drifts each jellyfish slowly upward on its own seeded path, wrapping softly", () => {
    // a second's drift, measured where it does not wrap
    const speeds = m.SLOTS.map((_, i) => {
      for (const s of [100, 160, 220, 280]) {
        const v = m.jellyAt(i, s, [], 1, rand).y - m.jellyAt(i, s + 1, [], 1, rand).y;
        if (Math.abs(v) < 100) return v;
      }
      return NaN;
    });
    // upward (y down the screen gets smaller), slowly, each at its own pace
    for (const v of speeds) {
      expect(v).toBeGreaterThan(0.5);
      expect(v).toBeLessThan(12);
    }
    expect(new Set(speeds.map((v) => v.toFixed(3))).size).toBeGreaterThan(10);
    // the same song time, the same place
    expect(m.jellyAt(5, 77.7, [], 1, rand)).toEqual(m.jellyAt(5, 77.7, [], 1, rand));
    // over a long song every one wraps round, fading out at the top and back in at the bottom
    // (below the frame, or for the far ones out of the dark water near the horizon)
    for (let i = 0; i < 14; i++) {
      let faded = false;
      let lo = Infinity,
        hi = -Infinity;
      for (let s = 0; s < 3600; s += 2) {
        const j = m.jellyAt(i, s, [], 1, rand);
        expect(j.fade).toBeGreaterThanOrEqual(0);
        expect(j.fade).toBeLessThanOrEqual(1);
        if (j.fade < 0.02) faded = true;
        lo = Math.min(lo, j.y);
        hi = Math.max(hi, j.y);
      }
      expect(faded).toBe(true);
      if (m.SLOTS[i].tier === "far") {
        expect(lo).toBeLessThan(m.HORIZON);
        expect(hi - lo).toBeGreaterThan(300);
      } else {
        expect(hi).toBeGreaterThan(1080); // starts again below the frame
        expect(hi - lo).toBeGreaterThan(600);
      }
    }
    // it sways a little sideways and leans with it
    const xs = Array.from({ length: 120 }, (_, s) => m.jellyAt(3, s, [], 1, rand).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(160);
    for (let s = 0; s < 120; s += 3)
      expect(Math.abs(m.jellyAt(3, s, [], 1, rand).lean)).toBeLessThan(0.3);
    // the lean only changes a few times a second (turning the jellyfish moves every voxel)
    expect(m.LEAN_RATE).toBeLessThanOrEqual(6);
    const held = 10 + 0.1 / m.LEAN_RATE;
    expect(m.jellyAt(3, held, [], 1, rand).lean).toBe(m.jellyAt(3, 10, [], 1, rand).lean);
  });

  it("a beat swims it up: contracted, then higher than without the beat", () => {
    const quiet = m.jellyAt(0, 60, [], 1, rand);
    const now = m.jellyAt(0, 60, one(m.ATTACK), 1, rand);
    expect(now.contraction).toBeGreaterThan(0.9);
    expect(now.w).toBeLessThan(1);
    expect(now.h).toBeGreaterThan(1);
    expect(now.x).toBe(quiet.x);
    const later = m.jellyAt(0, 60, one(0.8), 1, rand);
    expect(later.y).toBeLessThan(quiet.y);
    expect(quiet.y - later.y).toBeLessThanOrEqual(m.PUSH_MAX * quiet.width + 1e-9);
    expect(later.lift).toBeGreaterThan(0);
  });

  it("is a pure function of the song time and the beats: alone, in order, or in a section", () => {
    const whole = viz.createAudio(full);
    const at = (audio: ToolkitAudio, t: number, songTime: number, i: number) =>
      m.jellyAt(i, songTime, m.beatsAt(audio, t), 1, rand);
    // drawn alone vs after many earlier frames
    const alone = at(whole, 7.3, 7.3, 4);
    for (let t = 0; t < 7.3; t += 1 / FPS) at(whole, t, t, 4);
    expect(at(whole, 7.3, 7.3, 4)).toEqual(alone);
    // a section at the same song time
    for (const start of [2.5, 6, 9.1]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (const t of [0, 0.4, 1.33, 3]) {
        for (const i of [0, 2, 9]) {
          const a = at(section, t, start + t, i);
          const b = at(whole, start + t, start + t, i);
          for (const k of Object.keys(b) as (keyof State)[]) expect(a[k], k).toBeCloseTo(b[k], 6);
        }
      }
    }
  });
});

describe("Moon Jelly motion: the tentacles", () => {
  const sway = { amp: 0.3, freq: 0.25, phase: 1.1, wave: 3 };

  it("trail the bell: the tip still shows the bell as it was a moment ago", () => {
    const tr = m.trail(0, 60, one(m.ATTACK + 0.05), 1, rand, 10);
    expect(tr.delays).toHaveLength(10);
    expect(tr.delays[0]).toBe(0);
    expect(tr.delays[9]).toBeCloseTo(m.TRAIL, 9);
    expect(tr.w[0]).toBeLessThan(0.95); // the bell now: contracted
    expect(tr.w[9]).toBe(1); // a tentacle's tip: the bell before the beat
    expect(tr.dx[0]).toBe(0);
    expect(tr.dy[0]).toBe(0);
    // a while after, the bell has relaxed and lifted while the tip lags below
    const after = m.trail(0, 60, one(0.95), 1, rand, 10);
    expect(after.w[0]).toBe(1);
    expect(after.w[9]).toBeLessThan(1);
    expect(after.dy[9]).toBeGreaterThan(0); // the bell was lower then (y down)
  });

  it("re-poses a chain as a delayed sine wave growing toward the tip", () => {
    const calm = m.trail(2, 30, [], 1, rand, 12);
    const pose = m.chainPose(calm, 100, 0.9, 0, 20, sway, 30, 0.5);
    expect(pose).toHaveLength(60);
    expect(Array.from(pose).every(Number.isFinite)).toBe(true);
    // the anchor stays on the rim; the links swing more toward the tip
    expect(Math.hypot(pose[0], pose[1], pose[2])).toBeLessThan(0.02);
    const swing = (k: number) =>
      Math.max(
        ...Array.from({ length: 40 }, (_, s) =>
          Math.abs(m.chainPose(calm, 100, 0.9, 0, 20, sway, 30 + s * 0.1, 0.5)[k * 3]),
        ),
      );
    expect(swing(19)).toBeGreaterThan(swing(5));
    expect(swing(19)).toBeLessThan(1);
    // the wave travels down: the tip lags the middle
    const mid = (s: number) => m.chainPose(calm, 100, 0.9, 0, 20, sway, s, 0.5)[10 * 3];
    const tip = (s: number) => m.chainPose(calm, 100, 0.9, 0, 20, sway, s, 0.5)[19 * 3];
    expect(mid(30)).not.toBeCloseTo(tip(30), 3);
    // contracted bell: the rim pulls in at the anchor first; the tip follows later
    const beat = m.trail(0, 60, one(m.ATTACK + 0.05), 1, rand, 12);
    const p = m.chainPose(beat, 100, 1, 0, 20, { ...sway, amp: 0 }, 60, 0);
    expect(p[0]).toBeLessThan(-0.05);
    expect(Math.abs(p[19 * 3])).toBeLessThan(Math.abs(p[0]));
    // louder music, livelier sway
    const loud = Math.abs(m.chainPose(calm, 100, 0.9, 0, 20, sway, 31, 1)[19 * 3]);
    const soft = Math.abs(m.chainPose(calm, 100, 0.9, 0, 20, sway, 31, 0)[19 * 3]);
    expect(loud).toBeGreaterThan(soft);
  });
});

describe("Moon Jelly motion: glow, ripple and light", () => {
  it("each jellyfish glows with its own band: the front ones the bass", () => {
    const audio = viz.createAudio(full, { spectrumLow: 30, spectrumHigh: 1000, spectrumCount: 40 });
    const lv = m.bandLevels(audio.spectrum(5), 1, 2);
    expect(lv).toHaveLength(14);
    for (const x of lv) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    const farthest = m.SLOTS.reduce((a, s, i) => (s.band > m.SLOTS[a].band ? i : a), 0);
    expect(lv[0]).toBeGreaterThan(lv[farthest]); // this music is bass heavy
    expect(m.SLOTS[0].band).toBeLessThan(0.2);
    expect(m.SLOTS[farthest].band).toBeGreaterThan(0.6);
    expect(Array.from(m.bandLevels(new Float32Array(40), 1, 2))).toEqual(new Array(14).fill(0));
    expect(m.bandLevels(audio.spectrum(5), 1, 8)[0]).toBeGreaterThanOrEqual(lv[0]);
  });

  it("glows with the loudness, the band and the swim; softly in silence", () => {
    const calm = m.glowLevel(0, 0, 0, 1);
    expect(calm).toBeGreaterThan(0.3);
    expect(m.glowLevel(1, 0, 0, 1)).toBeGreaterThan(calm);
    expect(m.glowLevel(0, 1, 0, 1)).toBeGreaterThan(calm);
    expect(m.glowLevel(0, 0, 1, 1)).toBeGreaterThan(calm);
    expect(m.glowLevel(1, 1, 1, 2)).toBeLessThanOrEqual(2);
    expect(m.glowLevel(1, 1, 1, 0.2)).toBeLessThan(m.glowLevel(1, 1, 1, 1));
    expect(Number.isFinite(m.glowLevel(NaN, NaN, NaN, NaN))).toBe(true);
  });

  it("the ripple wobbles the picture a few pixels on the beat, none when off", () => {
    expect(m.WOBBLE_MAX).toBeLessThanOrEqual(4);
    expect(m.wobblePx(1, true, 2)).toBeLessThanOrEqual(m.WOBBLE_MAX);
    expect(m.wobblePx(1, true, 1)).toBeGreaterThan(1);
    expect(m.wobblePx(0, true, 1)).toBe(0);
    expect(m.wobblePx(1, false, 1)).toBe(0);
    expect(m.wobblePx(NaN, true, NaN)).toBe(0);
    expect(m.RIPPLE_RELEASE).toBeGreaterThan(0.2);
  });

  it("the light shafts sway slowly", () => {
    for (let s = 0; s < 600; s += 0.7)
      expect(Math.abs(m.shaftSway(s))).toBeLessThanOrEqual(m.SHAFT_MAX);
    expect(m.SHAFT_MAX).toBeLessThan(0.3);
    for (let s = 0; s < 60; s += 1 / 30) {
      expect(Math.abs(m.shaftSway(s + 1 / 30) - m.shaftSway(s))).toBeLessThan(0.002);
    }
    expect(m.shaftSway(10)).not.toBe(m.shaftSway(20));
    expect(Number.isFinite(m.shaftSway(NaN))).toBe(true);
  });

  it("writes 'artist · title' and fits a long one by shrinking, then wrapping", () => {
    expect(m.titleLine("AXIOM", "T-REX")).toBe("AXIOM · T-REX");
    expect(m.titleLine("", "T-REX")).toBe("T-REX");
    expect(m.titleLine("  AXIOM ", "")).toBe("AXIOM");
    const measure = (s: string) => s.length * 0.7;
    const line = m.titleLine("A".repeat(60), "B".repeat(30) + " " + "C".repeat(29));
    const fit = m.fitTitle(line, measure, 900, 2, 22, 13);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    for (const l of fit.lines) expect(measure(l) * fit.size).toBeLessThanOrEqual(900);
    expect(m.fitTitle("T-REX", measure, 900, 2, 22, 13)).toEqual({ size: 22, lines: ["T-REX"] });
    // the text under the horizon: one line when it fits, else the artist over the title
    expect(m.titleLines("AXIOM", "T-REX", measure, 900, 22, 13)).toEqual({
      size: 22,
      lines: ["AXIOM · T-REX"],
    });
    const two = m.titleLines(
      "A".repeat(60),
      "B".repeat(30) + " " + "C".repeat(29),
      measure,
      900,
      22,
      13,
    );
    expect(two.lines).toEqual(["A".repeat(60), "B".repeat(30) + " " + "C".repeat(29)]);
    for (const l of two.lines) expect(measure(l) * two.size).toBeLessThanOrEqual(900);
    expect(two.size).toBeGreaterThanOrEqual(13);
    const alone = m.titleLines("", "W".repeat(60), measure, 300, 22, 13);
    for (const l of alone.lines) expect(measure(l) * alone.size).toBeLessThanOrEqual(300);
    expect(m.titleLines("", "", measure, 900, 22, 13).lines).toEqual([]);
  });
});

describe("Moon Jelly motion: silence", () => {
  it("draws a calm frame: no swim, a soft glow, no NaN", () => {
    const audio = viz.createAudio(silent);
    for (const t of [0, 2, 7.5]) {
      const beats = m.beatsAt(audio, t);
      expect(beats).toEqual([]);
      for (let i = 0; i < 14; i++) {
        const j = m.jellyAt(i, t, beats, 1, rand);
        expect(j.contraction).toBe(0);
        expect(j.lift).toBe(0);
        expect(Object.values(j).every(Number.isFinite)).toBe(true);
        const tr = m.trail(i, t, beats, 1, rand, 8);
        expect(tr.w.every((w) => w === 1)).toBe(true);
      }
      expect(m.glowLevel(0, 0, 0, 1)).toBeGreaterThan(0);
    }
    const odd = m.jellyAt(3, NaN, [{ age: NaN, strength: NaN, frame: NaN }], NaN, rand);
    expect(Object.values(odd).every(Number.isFinite)).toBe(true);
  });
});
