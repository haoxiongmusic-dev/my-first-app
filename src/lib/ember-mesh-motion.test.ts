// Ember Mesh's motion maths (templates/ember-mesh/assets/mesh-motion.js): the waving sheet of
// dots, the size of each dot, the camera's poses and its jumps on strong beats, and the overlay's
// waveform. Worked out from the song time and the beat list alone, so any frame can be drawn on
// its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Pose = {
  yaw: number;
  pitch: number;
  dist: number;
  roll: number;
  fov: number;
  tx: number;
  ty: number;
  tz: number;
  bend: number;
  twist: number;
};
type Levels = { lift: number; ridges: Float32Array };
type Camera = { pose: Pose; slot: number; jumpAt: number };
type Motion = {
  COLS: number;
  ROWS: number;
  COUNT: number;
  STRIDE: number;
  HALF_X: number;
  HALF_Z: number;
  H_MAX: number;
  CALM: number;
  SLOT: number;
  JUMP_WINDOW: number;
  MIN_GAP: number;
  JUMP_EASE: number;
  STRONG: number;
  HIT_LOOKBACK: number;
  POSES: Pose[];
  PULSE_RELEASE: number;
  BEAT_SCALE: number;
  COVER_SIZE: number;
  WAVE_POINTS: number;
  WAVE_CURVES: number;
  WAVE_MAX: number;
  ridgeCount: (bandPct: number) => number;
  shapeLevels: (line: ArrayLike<number>) => Levels;
  waveAmp: (lift: number, intensity: number) => number;
  heightAt: (x: number, z: number, songTime: number, amp: number, ridge: number) => number;
  ridgeAt: (ridges: ArrayLike<number>, u: number) => number;
  dotScale: (h: number) => number;
  buildSheet: (
    out: Float32Array,
    songTime: number,
    levels: Levels,
    intensity: number,
    pose: Pose,
  ) => Float32Array;
  heatPalette: (
    main: [number, number, number],
    accent: [number, number, number],
    n: number,
  ) => Float32Array;
  poseIndex: (slot: number, mulberry32: VizToolkit["mulberry32"]) => number;
  cameraAt: (
    songTime: number,
    hits: [number, number][],
    moves: boolean,
    fps: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => Camera;
  viewProjection: (pose: Pose, aspect: number) => Float32Array;
  pixelScale: (pose: Pose, heightPx: number) => number;
  overlayScale: (env: number) => number;
  waveCurves: (values: ArrayLike<number>, songTime: number, intensity: number) => Float32Array[];
};
const m = require("../../templates/ember-mesh/assets/mesh-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const LENGTH = 70;

/** A 70 s song: silent for 2 s, then loud and bass-heavy with a hit every half second whose
 * strength varies (seeded), so some beats are strong and some are not. */
function song(): ToolkitAnalysis {
  const rnd = viz.mulberry32(99);
  const hits: [number, number][] = [];
  for (let t = 2.03; t < LENGTH; t += 0.5) hits.push([Math.round(t * 1000) / 1000, rnd()]);
  const frames: Frame[] = Array.from({ length: LENGTH * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 2 * FPS ? Math.max(0, 1 - k / 14) : 0)),
    l: i >= 2 * FPS ? 0.8 : 0,
    k: i >= 2 * FPS && i % 15 === 1 ? 1 : 0,
    f: i >= 2 * FPS ? 0.4 : 0,
  }));
  return { version: 1, fps: FPS, bands: 32, duration: LENGTH, frames, hits };
}
const full = song();

function allFinite(xs: ArrayLike<number>): boolean {
  for (let i = 0; i < xs.length; i++) if (!Number.isFinite(xs[i])) return false;
  return true;
}
/** A pose as comparable numbers: angles in radians, the distance on a log scale (a step from 30
 * to 33 is like one from 6 to 6.6), positions in fifths of a world unit. */
function poseValues(p: Pose): number[] {
  return [
    p.yaw,
    p.pitch,
    Math.log(p.dist),
    p.roll,
    p.fov,
    p.tx / 5,
    p.ty / 5,
    p.tz / 5,
    p.bend,
    p.twist,
  ];
}
function poseDistance(a: Pose, b: Pose): number {
  const x = poseValues(a),
    y = poseValues(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}
/** The camera at time t of an analysis, as the template asks for it. */
function camAt(analysis: ToolkitAnalysis, t: number, moves = true): Camera {
  const audio = viz.createAudio(analysis);
  return m.cameraAt(
    audio.songStart + t,
    audio.recentHits(t, m.HIT_LOOKBACK),
    moves,
    audio.fps,
    viz.mulberry32,
  );
}

describe("Ember Mesh motion", () => {
  it("is laid out as the spec says", () => {
    expect([m.COLS, m.ROWS]).toEqual([220, 70]);
    expect(m.COUNT).toBe(15400);
    expect(m.COVER_SIZE).toBe(220);
    expect(m.BEAT_SCALE).toBe(0.03);
    expect(m.POSES).toHaveLength(6);
    expect(m.MIN_GAP).toBe(4);
    expect(m.JUMP_EASE).toBe(0.25);
    // a slot holds at most one jump, inside its first JUMP_WINDOW seconds, so two jumps are
    // always at least SLOT - JUMP_WINDOW apart
    expect(m.SLOT - m.JUMP_WINDOW).toBeGreaterThanOrEqual(m.MIN_GAP);
    // what the camera needs to know fits in a section's 6 s of analysis before its start
    expect(m.SLOT).toBeLessThanOrEqual(5.5);
  });

  it("bands: spectrum ridges along the sheet, a fifth of the full count up to all of it", () => {
    expect(m.ridgeCount(100)).toBe(48);
    expect(m.ridgeCount(10)).toBe(Math.round(48 * 0.2));
    expect(m.ridgeCount(50)).toBe(27);
    expect(m.ridgeCount(500)).toBe(48);
    expect(m.ridgeCount(-1)).toBe(Math.round(48 * 0.2));
    expect(m.ridgeCount(NaN)).toBe(27);
  });

  it("shapes the levels: the bass lifts the waves, ridges stand out against the loudest", () => {
    const silent = m.shapeLevels(new Float32Array(27));
    expect(silent.lift).toBe(0);
    expect(allFinite(silent.ridges)).toBe(true);
    expect(Math.max(...silent.ridges)).toBe(0);
    const quiet = m.shapeLevels(new Float32Array(27).fill(0.3));
    const loud = m.shapeLevels(new Float32Array(27).fill(0.9));
    expect(loud.lift).toBeGreaterThan(quiet.lift * 4);
    expect(loud.lift).toBeLessThanOrEqual(1);
    // loud music sits around 0.5–1: the loudest band is 1 and a band at 0.6 of it is well down
    const mixed = m.shapeLevels(Float32Array.from([0.9, 0.54, 0.9, 0.9]));
    expect(Math.max(...mixed.ridges)).toBeCloseTo(1, 6);
    expect(mixed.ridges[1]).toBeLessThan(0.4);
  });

  it("wave heights are capped, and come from the song time and the spectrum only", () => {
    const amp = m.waveAmp(1, 2);
    let worst = 0;
    const rnd = viz.mulberry32(7);
    for (let i = 0; i < 4000; i++) {
      const h = m.heightAt(
        (rnd() * 2 - 1) * m.HALF_X,
        (rnd() * 2 - 1) * m.HALF_Z,
        rnd() * 3600,
        amp,
        rnd() * 4,
      );
      expect(Number.isFinite(h)).toBe(true);
      worst = Math.max(worst, Math.abs(h));
    }
    expect(worst).toBeLessThanOrEqual(m.H_MAX);
    expect(m.heightAt(3, 1, 12.5, 1, 0.5)).toBe(m.heightAt(3, 1, 12.5, 1, 0.5));
    // the waves travel: the same spot moves over time
    expect(Math.abs(m.heightAt(3, 1, 12.5, 1, 0) - m.heightAt(3, 1, 13.0, 1, 0))).toBeGreaterThan(
      0.01,
    );
  });

  it("the bass lifts the waves, scaled by intensity", () => {
    expect(m.waveAmp(0, 1)).toBe(m.CALM);
    expect(m.waveAmp(1, 1)).toBeGreaterThan(m.CALM * 3);
    expect(m.waveAmp(1, 2)).toBeGreaterThan(m.waveAmp(1, 1));
    expect(m.waveAmp(1, 0.2)).toBeLessThan(m.waveAmp(1, 1));
  });

  it("dots grow with the local wave height (the pulsing spheres)", () => {
    let last = -Infinity;
    for (let h = -m.H_MAX; h <= m.H_MAX; h += 0.05) {
      const s = m.dotScale(h);
      expect(s).toBeGreaterThanOrEqual(last);
      expect(s).toBeGreaterThan(0);
      last = s;
    }
    expect(m.dotScale(m.H_MAX)).toBeGreaterThan(m.dotScale(0) * 1.8);
    expect(m.dotScale(m.H_MAX)).toBeLessThan(3);
    expect(m.dotScale(NaN)).toBe(m.dotScale(0));
  });

  it("builds the sheet: silence is calm, loud music is tall, the same input the same sheet", () => {
    const flat: Pose = { ...m.POSES[0], bend: 0, twist: 0 };
    const out = new Float32Array(m.COUNT * m.STRIDE);
    const silent = m.shapeLevels(new Float32Array(27));
    m.buildSheet(out, 0, silent, 1, flat);
    expect(allFinite(out)).toBe(true);
    let calm = 0,
      calmSize = 0;
    for (let i = 0; i < m.COUNT; i++) {
      calm = Math.max(calm, Math.abs(out[i * m.STRIDE + 1]));
      calmSize = Math.max(calmSize, out[i * m.STRIDE + 3]);
    }
    expect(calm).toBeLessThanOrEqual(m.CALM + 1e-6);
    expect(calmSize).toBeLessThan(m.dotScale(m.H_MAX) * 0.6);
    const loud = m.shapeLevels(new Float32Array(27).fill(0.9));
    const a = m.buildSheet(new Float32Array(m.COUNT * m.STRIDE), 40.2, loud, 1, flat);
    let tall = 0;
    for (let i = 0; i < m.COUNT; i++) tall = Math.max(tall, Math.abs(a[i * m.STRIDE + 1]));
    expect(tall).toBeGreaterThan(calm * 4);
    const b = m.buildSheet(new Float32Array(m.COUNT * m.STRIDE), 40.2, loud, 1, flat);
    expect(Array.from(b)).toEqual(Array.from(a));
    // it spans the grid: 220 columns along x, 70 rows across z
    expect(Math.min(...Array.from({ length: m.COUNT }, (_, i) => a[i * m.STRIDE]))).toBeCloseTo(
      -m.HALF_X,
      3,
    );
  });

  it("folds and twists the sheet without stretching it, and stays finite for any pose", () => {
    const levels = m.shapeLevels(new Float32Array(27).fill(0.5));
    for (const pose of m.POSES) {
      const out = m.buildSheet(new Float32Array(m.COUNT * m.STRIDE), 9, levels, 2, pose);
      expect(allFinite(out)).toBe(true);
    }
    // an arch: the sheet's middle is the top and both ends come down a long way
    const arch: Pose = { ...m.POSES[0], bend: 2.4, twist: 0 };
    const out = m.buildSheet(new Float32Array(m.COUNT * m.STRIDE), 0, m.shapeLevels([0]), 1, arch);
    const mid = Math.floor(m.COLS / 2) * m.ROWS + 35;
    const end = 0 * m.ROWS + 35;
    expect(out[end * m.STRIDE + 1]).toBeLessThan(out[mid * m.STRIDE + 1] - 10);
    // neighbouring dots along the sheet stay one spacing apart
    const step = Math.hypot(
      out[(mid + m.ROWS) * m.STRIDE] - out[mid * m.STRIDE],
      out[(mid + m.ROWS) * m.STRIDE + 1] - out[mid * m.STRIDE + 1],
    );
    expect(step).toBeCloseTo((2 * m.HALF_X) / (m.COLS - 1), 1);
  });

  it("the heat map runs from the main colour in the middle to the accent at the edges", () => {
    const pal = m.heatPalette([1, 0.82, 0.12], [0.48, 0.17, 1], 64);
    expect(pal.length).toBe(64 * 3);
    expect(Array.from(pal.slice(0, 3)).map((v) => +v.toFixed(3))).toEqual([1, 0.82, 0.12]);
    expect(Array.from(pal.slice(63 * 3)).map((v) => +v.toFixed(3))).toEqual([0.48, 0.17, 1]);
    // the original's way from yellow to purple goes through orange and red, not grey
    const red = pal.slice(28 * 3, 28 * 3 + 3);
    expect(red[0]).toBeGreaterThan(0.8);
    expect(red[1]).toBeLessThan(0.35);
    expect(allFinite(m.heatPalette([0, 0, 0], [1, 1, 1], 16))).toBe(true);
  });

  it("poses come in a seeded order: every pose in each run of six, never the same twice", () => {
    for (let slot = -12; slot < 400; slot++) {
      const p = m.poseIndex(slot, viz.mulberry32);
      expect(Number.isInteger(p) && p >= 0 && p < 6).toBe(true);
      expect(m.poseIndex(slot + 1, viz.mulberry32)).not.toBe(p);
      expect(m.poseIndex(slot, viz.mulberry32)).toBe(p);
    }
    for (let block = 0; block < 20; block++) {
      const seen = new Set(
        Array.from({ length: 6 }, (_, i) => m.poseIndex(block * 6 + i, viz.mulberry32)),
      );
      expect(seen.size).toBe(6);
    }
  });

  it("the camera is deterministic, and a section matches the full song", () => {
    for (const start of [17.3, 41.0, 4.6]) {
      const part = sliceAnalysis(full, start, start + 12);
      for (let t = 0; t < 12; t += 1 / FPS) {
        const s = camAt(part, t);
        const w = camAt(full, start + t);
        expect(s.slot).toBe(w.slot);
        expect(s.jumpAt).toBeCloseTo(w.jumpAt, 6);
        expect(poseDistance(s.pose, w.pose)).toBeLessThan(1e-6);
      }
    }
    expect(camAt(full, 33.4)).toEqual(camAt(full, 33.4));
  });

  it("jumps to the next pose on strong beats, at most once every 4 s, with a 0.25 s ease", () => {
    const jumps = new Set<number>();
    for (let t = 0; t < LENGTH; t += 1 / FPS) {
      const c = camAt(full, t);
      if (c.jumpAt >= 0) jumps.add(Math.round(c.jumpAt * FPS));
    }
    const times = [...jumps].sort((a, b) => a - b).map((f) => f / FPS);
    expect(times.length).toBeGreaterThan(5);
    for (let i = 1; i < times.length; i++)
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(m.MIN_GAP);
    // each jump is on a strong beat
    for (const j of times) {
      const hit = full.hits.find(([h]) => Math.abs(h - j) < 1 / FPS);
      expect(hit && hit[1]).toBeGreaterThanOrEqual(m.STRONG);
    }
    // after the ease the camera stands on the next pose of the order (give or take its drift)
    const j = times[1];
    const before = camAt(full, j - 0.01);
    const after = camAt(full, j + m.JUMP_EASE + 0.02);
    const halfway = camAt(full, j + m.JUMP_EASE / 2);
    expect(poseDistance(before.pose, after.pose)).toBeGreaterThan(0.3);
    expect(poseDistance(halfway.pose, after.pose)).toBeLessThan(
      poseDistance(before.pose, after.pose),
    );
    // between jumps it glides: small steps from frame to frame
    for (let t = j + 0.4; t < j + 3.5; t += 1 / FPS)
      expect(poseDistance(camAt(full, t).pose, camAt(full, t + 1 / FPS).pose)).toBeLessThan(0.12);
  });

  it("with camera moves off it only glides between poses", () => {
    let worst = 0;
    for (let t = 0; t < LENGTH; t += 1 / FPS) {
      const c = camAt(full, t, false);
      expect(c.jumpAt).toBe(-1);
      worst = Math.max(worst, poseDistance(c.pose, camAt(full, t + 1 / FPS, false).pose));
    }
    expect(worst).toBeLessThan(0.12);
    // and it still travels through the poses
    expect(poseDistance(camAt(full, 10, false).pose, camAt(full, 20, false).pose)).toBeGreaterThan(
      0.5,
    );
  });

  it("silence: no beats, a gliding camera and finite matrices", () => {
    const c = m.cameraAt(0, [], true, FPS, viz.mulberry32);
    expect(c.jumpAt).toBe(-1);
    for (const pose of [...m.POSES, c.pose]) {
      expect(allFinite(m.viewProjection(pose, 16 / 9))).toBe(true);
      expect(m.pixelScale(pose, 1080)).toBeGreaterThan(100);
    }
    expect(allFinite(poseValues(m.cameraAt(NaN, [], true, FPS, viz.mulberry32).pose))).toBe(true);
  });

  it("puts the middle of the sheet in front of the camera", () => {
    for (const pose of m.POSES) {
      const vp = m.viewProjection(pose, 16 / 9);
      const [x, y, z] = [pose.tx, pose.ty, pose.tz];
      const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      expect(w).toBeGreaterThan(1); // in front, not behind
      const sx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
      const sy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
      expect(Math.abs(sx)).toBeLessThan(0.05);
      expect(Math.abs(sy)).toBeLessThan(0.05);
    }
  });

  it("the overlay pulses 1 + 0.03 × the beat envelope", () => {
    expect(m.overlayScale(0)).toBe(1);
    expect(m.overlayScale(1)).toBeCloseTo(1.03, 9);
    expect(m.overlayScale(NaN)).toBe(1);
    expect(m.overlayScale(5)).toBeCloseTo(1.03, 9);
  });

  it("the waveform: a few smooth curves, flat in silence, capped, tapering to its ends", () => {
    const silent = m.waveCurves(new Float32Array(m.WAVE_POINTS), 12, 1);
    expect(silent).toHaveLength(m.WAVE_CURVES);
    expect(m.WAVE_CURVES).toBeGreaterThanOrEqual(2);
    for (const c of silent) {
      expect(c).toHaveLength(m.WAVE_POINTS);
      expect(Math.max(...c.map(Math.abs))).toBe(0);
    }
    const values = new Float32Array(m.WAVE_POINTS).fill(1);
    const loud = m.waveCurves(values, 12, 2);
    for (const c of loud) {
      expect(allFinite(c)).toBe(true);
      expect(Math.max(...c.map(Math.abs))).toBeLessThanOrEqual(m.WAVE_MAX);
      expect(Math.abs(c[0])).toBeLessThan(0.5);
      expect(Math.abs(c[c.length - 1])).toBeLessThan(0.5);
    }
    expect(Math.max(...loud[0].map(Math.abs))).toBeGreaterThan(m.WAVE_MAX * 0.5);
    // smooth: neighbouring points close together
    for (let i = 1; i < loud[0].length; i++)
      expect(Math.abs(loud[0][i] - loud[0][i - 1])).toBeLessThan(m.WAVE_MAX * 0.3);
    // the same song time draws the same curves; they move over time
    expect(m.waveCurves(values, 12, 2).map((c) => Array.from(c))).toEqual(
      loud.map((c) => Array.from(c)),
    );
    expect(m.waveCurves(values, 12.3, 2)[0]).not.toEqual(loud[0]);
  });
});
