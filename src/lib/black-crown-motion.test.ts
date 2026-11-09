// Black Crown's motion maths (templates/black-crown/assets/crown-motion.js): worked out from the
// song time alone (or seeded), so any frame can be drawn on its own and a section matches the
// full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Ring = { radius: number; amp: number; width: number };
type Crown = { count: number; params: Float32Array };
type Motion = {
  WIDTH: number;
  HEIGHT: number;
  HORIZON_Y: number;
  CROWN_BASE_Y: number;
  CAM_H: number;
  FOV: number;
  FOCAL: number;
  CROWN_DIST: number;
  PX_PER_UNIT: number;
  CROWN_MAX_PX: number;
  CROWN_RELEASE: number;
  LOOKBACK: number;
  BASS_COLUMNS: number;
  MIN_SPIKES: number;
  MAX_SPIKES: number;
  SPREAD: number;
  SPIKE_STRIDE: number;
  RIPPLE_STRONG: number;
  RIPPLE_LIFE: number;
  RIPPLE_HITS: number;
  CALM_EVERY: number;
  CALM_LIFE: number;
  MAX_RINGS: number;
  SKY_FLARE: number;
  project: (x: number, y: number, z: number) => [number, number];
  bassLevel: (spectrum: ArrayLike<number>) => number;
  crownLevel: (audio: ToolkitAudio, t: number, scratch?: Float32Array) => number;
  crownHeightPx: (level: number, intensity: number) => number;
  sharpness: (level: number) => number;
  spikeCount: (setting: number) => number;
  buildCrown: (count: number, mulberry32: VizToolkit["mulberry32"]) => Crown;
  spikesAt: (crown: Crown, level: number, songTime: number, intensity: number) => Float32Array;
  domeAt: (level: number, intensity: number) => { radius: number; height: number };
  ripples: (
    hits: [number, number][],
    songTime: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => Ring[];
  calmRipples: (songTime: number) => Ring[];
  skyFlare: (loud: number) => number;
  hudBarCount: (bandPct: number) => number;
  barHeights: (values: ArrayLike<number>) => Float32Array;
  DOME_FOOT: number;
};
const m = require("../../templates/black-crown/assets/crown-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const AUDIO_OPTS = { spectrumLow: 30, spectrumHigh: 150, spectrumBoost: 2, spectrumCount: 8 };

/**
 * 10 s: silent for the first second, then a bass that swells and drops every half second
 * (full on even half seconds, gone on odd ones) until 8 s, then silence again. A hit every
 * half second from 1.0 s, strong and weak in turn.
 */
function frames(): Frame[] {
  return Array.from({ length: 10 * FPS }, (_, i) => {
    const on = i >= 30 && i < 240 && Math.floor(i / 15) % 2 === 0;
    return {
      b: Array.from({ length: 32 }, (_, k) => (on ? Math.max(0, 1 - k / 14) : 0)),
      l: on ? 0.8 : i >= 30 && i < 240 ? 0.4 : 0,
      k: i >= 30 && i < 240 && i % 15 === 0 ? 1 : 0,
      f: on ? 0.4 : 0,
    };
  });
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
  duration: 10,
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
/** The tips of every spike, in px above the water (the crown's height). */
function tipHeightsPx(spikes: Float32Array): number[] {
  const S = m.SPIKE_STRIDE;
  const out: number[] = [];
  for (let i = 0; i < spikes.length / S; i++) {
    out.push((spikes[i * S + 1] + spikes[i * S + 3]) * m.PX_PER_UNIT);
  }
  return out;
}

describe("Black Crown motion", () => {
  it("lays the scene out as the spec says: sky above 65 %, the crown on the liquid", () => {
    expect(m.WIDTH).toBe(1920);
    expect(m.HEIGHT).toBe(1080);
    expect(m.HORIZON_Y).toBe(Math.round(0.65 * 1080));
    expect(m.CROWN_BASE_Y).toBeGreaterThan(m.HORIZON_Y + 100);
    expect(m.CROWN_BASE_Y).toBeLessThan(960);
    expect(m.CROWN_MAX_PX).toBe(300);
    expect(m.CROWN_RELEASE).toBe(0.15);
    // the camera looks level from CAM_H above the water: the horizon sits at HORIZON_Y and the
    // crown's foot (CROWN_DIST away, in the middle) at CROWN_BASE_Y
    const foot = m.project(0, 0, -m.CROWN_DIST);
    expect(foot[0]).toBeCloseTo(960, 6);
    expect(foot[1]).toBeCloseTo(m.CROWN_BASE_Y, 6);
    const far = m.project(0, 0, -1e7);
    expect(far[1]).toBeCloseTo(m.HORIZON_Y, 3);
    expect(m.FOCAL).toBeCloseTo(m.HORIZON_Y / Math.tan(((m.FOV / 2) * Math.PI) / 180), 6);
    // one world unit at the crown is PX_PER_UNIT pixels, up and across
    const up = m.project(0, 1, -m.CROWN_DIST);
    expect(foot[1] - up[1]).toBeCloseTo(m.PX_PER_UNIT, 6);
    const right = m.project(1, 0, -m.CROWN_DIST);
    expect(right[0] - 960).toBeCloseTo(m.PX_PER_UNIT, 6);
  });

  it("bass level: 0 in silence or quiet bass, 1 at full, rising with the bass, never NaN", () => {
    expect(m.bassLevel(new Float32Array(8))).toBe(0);
    expect(m.bassLevel(new Float32Array(8).fill(NaN))).toBe(0);
    expect(m.bassLevel(new Float32Array(8).fill(1))).toBeCloseTo(1, 6);
    expect(m.bassLevel(new Float32Array(8).fill(0.2))).toBe(0);
    expect(m.bassLevel([])).toBe(0);
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const v = m.bassLevel(new Float32Array(8).fill(x));
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    // the loud part of a song (boosted bass 0.75..1) still swings the crown clearly
    const lo = m.bassLevel(new Float32Array(8).fill(0.75));
    const hi = m.bassLevel(new Float32Array(8).fill(0.97));
    expect(hi - lo).toBeGreaterThan(0.3);
  });

  it("crown height: flat at silence, capped at 300 px × intensity", () => {
    expect(m.crownHeightPx(0, 1)).toBe(0);
    expect(m.crownHeightPx(1, 1)).toBeCloseTo(300, 6);
    expect(m.crownHeightPx(1, 2)).toBeCloseTo(600, 6);
    expect(m.crownHeightPx(0.5, 0.2)).toBeCloseTo(30, 6);
    expect(m.crownHeightPx(5, 1)).toBeCloseTo(300, 6);
    expect(m.crownHeightPx(NaN, 1)).toBe(0);
    expect(m.crownHeightPx(1, NaN)).toBe(0);
    expect(m.crownHeightPx(-1, 1)).toBe(0);
  });

  it("crown level follows the bass, released over 0.15 s, from the audio alone", () => {
    const audio = viz.createAudio(full, AUDIO_OPTS);
    const spec = new Float32Array(8);
    // silence before the music: flat
    expect(m.crownLevel(audio, 0.5, spec)).toBe(0);
    // while the bass is on: high
    const on = m.crownLevel(audio, 1.4, spec);
    expect(on).toBeGreaterThan(0.8);
    expect(on).toBeLessThanOrEqual(1);
    // the bass stops after 1.5 s: the crown sinks with a 0.15 s release, not at once
    const at = (s: number) => m.crownLevel(audio, s, spec);
    const last = 1.5 - 1 / FPS; // the last frame with the bass on
    const top = at(last);
    expect(at(last + 0.15)).toBeGreaterThan(top * Math.exp(-1) * 0.85);
    expect(at(last + 0.15)).toBeLessThan(top * Math.exp(-1) * 1.15);
    expect(at(last + 0.45)).toBeLessThan(top * 0.1);
    // nearly gone before the bass comes back at 2.0 s
    expect(at(1.95)).toBeLessThan(0.05);
    // it rises at once when the bass comes back
    expect(at(2.04)).toBeGreaterThan(0.6);
    // the same time gives the same level
    for (let s = 0; s < 10; s += 0.37) expect(at(s)).toBe(at(s));
    // the whole song: always 0..1, never NaN
    for (let s = -1; s < 11; s += 1 / 60) {
      const v = at(s);
      expect(isFiniteNumber(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // a silent song: flat everywhere
    const quiet = viz.createAudio(silent, AUDIO_OPTS);
    for (let s = 0; s < 3; s += 0.1) expect(m.crownLevel(quiet, s)).toBe(0);
  });

  it("crown level in a section matches the full render (the release looks back)", () => {
    const whole = viz.createAudio(full, AUDIO_OPTS);
    for (const start of [1.6, 3.2, 5]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 9), AUDIO_OPTS);
      expect(section.songStart).toBeCloseTo(start, 9);
      // right from the first frame of the section, when the release still remembers the past
      for (let t = 0; t < 3; t += 1 / FPS) {
        expect(m.crownLevel(section, t)).toBeCloseTo(m.crownLevel(whole, start + t), 6);
      }
    }
    expect(m.LOOKBACK).toBeGreaterThanOrEqual(4 * m.CROWN_RELEASE);
    expect(m.LOOKBACK).toBeLessThanOrEqual(1);
  });

  it("spike count: 12..40, whole numbers", () => {
    expect(m.spikeCount(24)).toBe(24);
    expect(m.spikeCount(5)).toBe(m.MIN_SPIKES);
    expect(m.spikeCount(99)).toBe(m.MAX_SPIKES);
    expect(m.spikeCount(17.6)).toBe(18);
    expect(m.spikeCount(NaN)).toBe(24);
    expect(m.MIN_SPIKES).toBe(12);
    expect(m.MAX_SPIKES).toBe(40);
  });

  it("the crown's layout: seeded, one spike in the middle, the rest fanning outwards", () => {
    for (const n of [12, 24, 40]) {
      const crown = m.buildCrown(n, viz.mulberry32);
      expect(crown.count).toBe(n);
      expect(Array.from(m.buildCrown(n, viz.mulberry32).params)).toEqual(Array.from(crown.params));
      const spikes = m.spikesAt(crown, 1, 3, 1);
      const S = m.SPIKE_STRIDE;
      expect(spikes.length).toBe(n * S);
      // the first spike stands in the middle
      expect(Math.hypot(spikes[0], spikes[2])).toBeLessThan(0.05);
      for (let i = 0; i < n; i++) {
        const [x, , z, , radius, tx, tz] = Array.from(spikes.slice(i * S, i * S + 7));
        const rho = Math.hypot(x, z);
        expect(rho).toBeLessThanOrEqual(m.SPREAD * 1.1);
        expect(radius).toBeGreaterThan(0);
        // leaning away from the middle (fanning out), more the further out
        if (rho > 0.2) {
          expect(tx * x + tz * z).toBeGreaterThan(0);
        }
      }
    }
    // a different count is a different layout
    const a = m.buildCrown(24, viz.mulberry32).params;
    const b = m.buildCrown(25, viz.mulberry32).params;
    expect(Array.from(a.slice(0, 16))).not.toEqual(Array.from(b.slice(0, 16)));
  });

  it("spikes: the tallest in the middle, all tips within the crown height, wobbling", () => {
    const crown = m.buildCrown(24, viz.mulberry32);
    const S = m.SPIKE_STRIDE;
    for (const intensity of [0.2, 1, 2]) {
      for (const level of [0.1, 0.5, 1]) {
        for (let s = 0; s < 6; s += 0.29) {
          const spikes = m.spikesAt(crown, level, s, intensity);
          const cap = m.crownHeightPx(level, intensity);
          for (const tip of tipHeightsPx(spikes)) expect(tip).toBeLessThanOrEqual(cap + 1e-3);
        }
      }
    }
    // the middle is taller than the edge, on average over time
    let inner = 0,
      outer = 0;
    for (let s = 0; s < 10; s += 0.1) {
      const spikes = m.spikesAt(crown, 1, s, 1);
      const tips = tipHeightsPx(spikes);
      for (let i = 0; i < crown.count; i++) {
        const rho = Math.hypot(spikes[i * S], spikes[i * S + 2]);
        if (rho < m.SPREAD * 0.35) inner = Math.max(inner, tips[i]);
        if (rho > m.SPREAD * 0.75) outer = Math.max(outer, tips[i]);
      }
    }
    expect(inner).toBeGreaterThan(outer * 1.4);
    expect(inner).toBeGreaterThan(0.85 * 300);
    // each spike wobbles on its own: heights change over time, the same time repeats
    const a = m.spikesAt(crown, 0.8, 4, 1),
      b = m.spikesAt(crown, 0.8, 4.25, 1);
    expect(Array.from(m.spikesAt(crown, 0.8, 4, 1))).toEqual(Array.from(a));
    let moved = 0;
    const phases = new Set<number>();
    for (let i = 0; i < crown.count; i++) {
      const d = b[i * S + 3] - a[i * S + 3];
      if (Math.abs(d) > 1e-4) moved++;
      phases.add(Math.sign(d));
    }
    expect(moved).toBeGreaterThan(crown.count / 2);
    expect(phases.size).toBeGreaterThan(1); // some rise while others fall
    // spikes sharpen as the crown grows
    expect(m.sharpness(1)).toBeGreaterThan(m.sharpness(0.3));
    expect(m.sharpness(0.3)).toBeGreaterThan(m.sharpness(0));
    expect(m.sharpness(NaN)).toBe(m.sharpness(0));
    expect(m.sharpness(0)).toBeGreaterThanOrEqual(1);
    // the dome they rise from grows with the crown and never pokes above it
    for (const level of [0, 0.3, 1]) {
      const dome = m.domeAt(level, 1);
      expect(dome.height * m.PX_PER_UNIT).toBeLessThan(m.crownHeightPx(level, 1) * 0.5 + 1e-6);
      expect(dome.radius).toBeGreaterThan(0);
    }
    expect(m.domeAt(1, 1).height).toBeGreaterThan(m.domeAt(0.3, 1).height);
  });

  it("silence: the crown lies flat, nothing is NaN", () => {
    const crown = m.buildCrown(24, viz.mulberry32);
    for (const level of [0, NaN]) {
      const spikes = m.spikesAt(crown, level, NaN, 1);
      expect(Array.from(spikes).every(isFiniteNumber)).toBe(true);
      for (const tip of tipHeightsPx(spikes)) expect(tip).toBe(0);
      const dome = m.domeAt(level, 1);
      expect(dome.height).toBe(0);
      expect(isFiniteNumber(dome.radius)).toBe(true);
    }
    // the whole pipeline from a silent song
    const audio = viz.createAudio(silent, AUDIO_OPTS);
    const level = m.crownLevel(audio, 1.5);
    expect(level).toBe(0);
    expect(tipHeightsPx(m.spikesAt(crown, level, 1.5, 1)).every((x) => x === 0)).toBe(true);
    expect(m.ripples(audio.recentHits(1.5, m.RIPPLE_HITS), 1.5, viz.mulberry32)).toEqual([]);
    expect(m.skyFlare(0)).toBe(1);
    expect(m.calmRipples(NaN).every((r) => isFiniteNumber(r.radius + r.amp + r.width))).toBe(true);
  });

  it("ripples: one per strong beat, spreading out and fading", () => {
    const strong = m.RIPPLE_STRONG + 0.2;
    const now = 20;
    const list = m.ripples(
      [
        [0, m.RIPPLE_STRONG - 0.2],
        [0.1, strong],
        [1, strong],
        [2, strong],
        [m.RIPPLE_LIFE + 0.2, strong],
      ],
      now,
      viz.mulberry32,
    );
    expect(list.length).toBe(3);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      expect(r.radius).toBeGreaterThan(0);
      expect(r.amp).toBeGreaterThan(0);
      expect(r.width).toBeGreaterThan(0);
      if (i > 0) expect(r.radius).toBeGreaterThan(list[i - 1].radius); // older: wider
    }
    // one ripple through its life: grows steadily, fades to nothing
    let prevR = 0,
      prevA = 2;
    for (let age = 0.2; age < m.RIPPLE_LIFE; age += 0.1) {
      const [r] = m.ripples([[age, strong]], now + age, viz.mulberry32);
      expect(r.radius).toBeGreaterThan(prevR);
      expect(r.amp).toBeLessThan(prevA);
      prevR = r.radius;
      prevA = r.amp;
    }
    expect(prevA).toBeLessThan(0.002);
    expect(m.ripples([[m.RIPPLE_LIFE, strong]], now, viz.mulberry32)).toEqual([]);
  });

  it("ripples are seeded by the beat's song frame: a section matches the full song", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 3.2, 9));
    let seen = 0;
    for (let t = 0; t < 4; t += 0.1) {
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
        expect(fromSection[i].radius).toBeCloseTo(fromWhole[i].radius, 4);
        expect(fromSection[i].amp).toBeCloseTo(fromWhole[i].amp, 5);
        expect(fromSection[i].width).toBeCloseTo(fromWhole[i].width, 5);
      }
      seen += fromSection.length;
    }
    expect(seen).toBeGreaterThan(0);
    // two beats of the same strength at the same age differ a little (seeded variety)
    const a = m.ripples([[1, 0.9]], 10, viz.mulberry32)[0];
    const b = m.ripples([[1, 0.9]], 10.5, viz.mulberry32)[0];
    expect(a.radius).not.toBeCloseTo(b.radius, 3);
  });

  it("calm ripples: a slow ring every 2 s, from the song time alone", () => {
    expect(m.CALM_EVERY).toBe(2);
    for (let s = 0; s < 30; s += 0.13) {
      const list = m.calmRipples(s);
      expect(list).toEqual(m.calmRipples(s));
      expect(list.length).toBeLessThanOrEqual(Math.ceil(m.CALM_LIFE / m.CALM_EVERY));
      for (const r of list) {
        expect(r.radius).toBeGreaterThan(0);
        expect(r.amp).toBeGreaterThanOrEqual(0);
        expect(r.amp).toBeLessThan(m.ripples([[0.3, 1]], 5, viz.mulberry32)[0].amp);
      }
    }
    // a new ring is born at every multiple of 2 s: the smallest ring restarts there
    const smallest = (s: number) => Math.min(...m.calmRipples(s).map((r) => r.radius));
    expect(smallest(10.01)).toBeLessThan(smallest(9.99));
    expect(smallest(11)).toBeGreaterThan(smallest(10.01));
    // the rings never outnumber what the water shader holds
    expect(m.RIPPLE_HITS + Math.ceil(m.CALM_LIFE / m.CALM_EVERY)).toBeLessThanOrEqual(m.MAX_RINGS);
  });

  it("the sky flares 20 % with the loudness", () => {
    expect(m.SKY_FLARE).toBe(0.2);
    expect(m.skyFlare(0)).toBe(1);
    expect(m.skyFlare(1)).toBeCloseTo(1.2, 9);
    expect(m.skyFlare(0.5)).toBeCloseTo(1.1, 9);
    expect(m.skyFlare(3)).toBeCloseTo(1.2, 9);
    expect(m.skyFlare(NaN)).toBe(1);
  });

  it("bands: the top spectrum's bar count, from a fifth of 80 bars to all of them", () => {
    expect(m.hudBarCount(10)).toBe(16);
    expect(m.hudBarCount(100)).toBe(80);
    expect(m.hudBarCount(50)).toBe(viz.bandsToRingCount(50, 80));
    expect(m.hudBarCount(NaN)).toBe(80);
    expect(m.hudBarCount(500)).toBe(80);
  });

  it("top spectrum bars: peaks stand out of a loud, full spectrum; silence is flat", () => {
    const loud = Float32Array.from({ length: 40 }, (_, k) => 0.8 + 0.2 * Math.sin(k / 3) ** 2);
    const h = m.barHeights(loud);
    expect(Math.max(...h)).toBeCloseTo(1, 4);
    expect(Math.min(...h)).toBeLessThan(0.45);
    for (const x of h) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    // the order of the bars is kept
    for (let a = 0; a < 40; a++)
      for (let b = 0; b < 40; b++) if (loud[a] > loud[b] + 1e-6) expect(h[a]).toBeGreaterThan(h[b]);
    expect(Array.from(m.barHeights(new Float32Array(40)))).toEqual(new Array(40).fill(0));
    expect(Array.from(m.barHeights(new Float32Array(40).fill(NaN))).every((x) => x === 0)).toBe(
      true,
    );
  });

  it("the mound is a bell: down to 3 % at its radius", () => {
    expect(Math.exp(-(m.DOME_FOOT ** 2))).toBeCloseTo(0.03, 9);
  });
});
