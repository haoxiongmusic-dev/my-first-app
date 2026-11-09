// Signal Dish's motion maths (templates/signal-dish/assets/dish-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Point = [number, number];
type Streak = { x0: number; y0: number; x1: number; y1: number; alpha: number };
type DishShape = {
  rim: Point[];
  back: Point[];
  mount: Point[];
  hub: Point[];
  struts: [number, number, number, number][];
  feed: [number, number, number];
};
type Sky = { stars: Float32Array; ridge: Float32Array };
type Motion = {
  HORIZON_Y: number;
  DISH_X: number;
  DISH_HEIGHT: number;
  AIM_MAX: number;
  AIM_PERIOD: number;
  RAY_INNER: number;
  RAY_MAX: number;
  HAIR_MAX: number;
  HAIR_WIDTH: number;
  HAIR_NEAR: number;
  HAIR_FAR: number;
  SHOOT_EVERY: number;
  SHOOT_LIFE: number;
  STAR_COUNT: number;
  STAR_STRIDE: number;
  TITLE_Y: number;
  PULSE_RELEASE: number;
  RIDGE_STEP: number;
  dishAim: (songTime: number) => number;
  dishTurn: (songTime: number) => number;
  dishShape: (aimDeg: number, turn: number) => DishShape;
  rayCount: (bandPct: number) => number;
  rayLengths: (
    values: ArrayLike<number>,
    intensity: number,
    weights?: ArrayLike<number>,
  ) => Float32Array;
  rayWeights: (count: number, mulberry32: VizToolkit["mulberry32"]) => Float32Array;
  hairCount: (bandPct: number) => number;
  hairOffsets: (count: number) => Float32Array;
  hairWeights: (count: number, mulberry32: VizToolkit["mulberry32"]) => Float32Array;
  hairHeights: (
    values: ArrayLike<number>,
    weights: ArrayLike<number>,
    intensity: number,
  ) => Float32Array;
  shootingStar: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => Streak | null;
  starLevel: (sky: Sky, index: number, songTime: number) => number;
  buildSky: (mulberry32: VizToolkit["mulberry32"]) => Sky;
  glowLevel: (loud: number) => number;
  streakLevel: (loud: number) => number;
  titleScale: (env: number, on: boolean) => number;
};
const m = require("../../templates/signal-dish/assets/dish-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 4 s: a kick every half second from 1.0 s, loud with a rising spectrum from 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 60 ? Math.min(1, ((k + i) % 32) / 31) : 0)),
    l: i >= 60 ? 0.8 : 0,
    k: i >= 30 && i % 15 === 0 ? 1 : 0,
    f: i >= 60 ? 0.4 : 0,
  }));
}
function analysis(fr: Frame[]): ToolkitAnalysis {
  return { version: 1, fps: FPS, bands: 32, duration: fr.length / FPS, frames: fr, hits: [] };
}
const full = analysis(frames());
const silentData = analysis(
  Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
);

function allPoints(s: DishShape): Point[] {
  const pts: Point[] = [...s.rim, ...s.back, ...s.mount, ...s.hub];
  for (const [x0, y0, x1, y1] of s.struts) pts.push([x0, y0], [x1, y1]);
  pts.push([s.feed[0], s.feed[1] - s.feed[2]], [s.feed[0], s.feed[1] + s.feed[2]]);
  return pts;
}

describe("Signal Dish motion", () => {
  it("the land covers the bottom 9 %, the title sits at y 430", () => {
    expect(m.HORIZON_Y).toBeGreaterThanOrEqual(975);
    expect(m.HORIZON_Y).toBeLessThanOrEqual(990);
    expect(m.TITLE_Y).toBe(430);
    expect(m.DISH_X).toBe(960);
  });

  it("the dish's aim stays within ±40°, reaches both ends and moves smoothly", () => {
    expect(m.AIM_MAX).toBe(40);
    expect(m.AIM_PERIOD).toBe(40);
    let lo = 0,
      hi = 0,
      steepest = 0;
    let prev = m.dishAim(0);
    for (let i = 1; i <= 600 * FPS; i++) {
      const a = m.dishAim(i / FPS);
      expect(Math.abs(a)).toBeLessThanOrEqual(40 + 1e-9);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
      steepest = Math.max(steepest, Math.abs(a - prev));
      prev = a;
    }
    expect(lo).toBeLessThan(-39);
    expect(hi).toBeGreaterThan(39);
    // slow: never more than about 0.4° from one frame to the next (≈ 12°/s)
    expect(steepest).toBeLessThan(0.4);
  });

  it("the aim swings once about every 40 s", () => {
    // count sign changes over 400 s: about 2 per period
    let crossings = 0;
    let prev = Math.sign(m.dishAim(0.01));
    for (let i = 1; i <= 400 * 10; i++) {
      const s = Math.sign(m.dishAim(i / 10));
      if (s !== 0 && s !== prev) {
        crossings++;
        prev = s;
      }
    }
    expect(crossings).toBeGreaterThanOrEqual(16);
    expect(crossings).toBeLessThanOrEqual(24);
  });

  it("the aim and turn depend only on the song time", () => {
    for (const s of [0, 3.3, 17, 61.25, 3599]) {
      expect(m.dishAim(s)).toBe(m.dishAim(s));
      expect(m.dishTurn(s)).toBe(m.dishTurn(s));
      expect(Number.isFinite(m.dishAim(s))).toBe(true);
    }
    // the dish turns too (its rim widens and narrows), within a sensible range
    let lo = 1,
      hi = 0;
    for (let i = 0; i <= 600; i++) {
      const k = m.dishTurn(i);
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
    }
    expect(lo).toBeGreaterThanOrEqual(0.1);
    expect(hi).toBeLessThanOrEqual(0.5);
    expect(hi - lo).toBeGreaterThan(0.2);
  });

  it("the dish is about 120 px tall, standing on the horizon in the middle", () => {
    expect(m.DISH_HEIGHT).toBe(120);
    const up = allPoints(m.dishShape(0, 0.3));
    const ys = up.map((p) => p[1]);
    const xs = up.map((p) => p[0]);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(m.HORIZON_Y - 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(108);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(132);
    expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 960)).toBeLessThan(2);
  });

  it("the dish leans the way it aims and stays clear of the rays", () => {
    for (const aim of [-40, -20, 0, 20, 40]) {
      const s = m.dishShape(aim, 0.25);
      const [fx, fy] = s.feed;
      // the feed sits in front of the dish, along the aim
      if (aim < 0) expect(fx).toBeLessThan(955);
      if (aim > 0) expect(fx).toBeGreaterThan(965);
      expect(fy).toBeLessThan(m.HORIZON_Y - 60);
      for (const [x, y] of allPoints(s)) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(x - 960)).toBeLessThan(m.RAY_INNER);
        expect(y).toBeLessThanOrEqual(m.HORIZON_Y + 12);
      }
    }
    // mirrored aims give mirrored shapes
    const l = m.dishShape(-30, 0.3).feed;
    const r = m.dishShape(30, 0.3).feed;
    expect(l[0] - 960).toBeCloseTo(960 - r[0], 6);
    expect(l[1]).toBeCloseTo(r[1], 6);
  });

  it("rays: a count from the Bands setting, lengths squared and capped at 120 px", () => {
    expect(m.RAY_MAX).toBe(120);
    expect(m.rayCount(100)).toBe(90);
    expect(m.rayCount(10)).toBe(18);
    for (let pct = 11; pct <= 100; pct++) {
      expect(m.rayCount(pct)).toBeGreaterThanOrEqual(m.rayCount(pct - 1));
    }
    expect(Array.from(m.rayLengths([0, 0.5, 1], 1))).toEqual([0, 30, 120]);
    expect(Array.from(m.rayLengths([0.5, 1, 3], 2))).toEqual([60, 120, 120]);
    expect(Array.from(m.rayLengths([-1, NaN], 1))).toEqual([0, 0]);
    expect(Array.from(m.rayLengths([1, 1], 1, [0.5, 1]))).toEqual([60, 120]);
  });

  it("ray weights are seeded, mirrored left/right and varied, so a loud fan isn't solid", () => {
    const w = Array.from(m.rayWeights(90, viz.mulberry32));
    expect(Array.from(m.rayWeights(90, viz.mulberry32))).toEqual(w);
    for (let i = 0; i < 90; i++) expect(w[i]).toBe(w[89 - i]);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...w)).toBeLessThanOrEqual(1);
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(0.3);
    const odd = Array.from(m.rayWeights(19, viz.mulberry32));
    expect(odd[9]).toBeGreaterThan(0);
  });

  it("rays fan over a semicircle with the bass at the top", () => {
    const angles = viz.ringAngles(m.rayCount(100), 180);
    expect(angles[0]).toBeGreaterThan(-Math.PI / 2);
    expect(angles[angles.length - 1]).toBeLessThan(Math.PI / 2);
    const spectrum = Array.from({ length: 32 }, (_, i) => 1 - i / 31);
    const v = viz.ringValues(spectrum, angles, 180);
    const mid = Math.floor(angles.length / 2);
    expect(v[mid]).toBeGreaterThan(v[0]);
    expect(v[0]).toBeCloseTo(v[angles.length - 1], 6);
  });

  it("hairlines: a count from the Bands setting, spread out from beside the dish", () => {
    expect(m.HAIR_WIDTH).toBe(2);
    expect(m.hairCount(100)).toBe(64);
    expect(m.hairCount(10)).toBe(13);
    const x = Array.from(m.hairOffsets(64));
    expect(x[0]).toBe(m.HAIR_NEAR);
    expect(x[63]).toBeCloseTo(m.HAIR_FAR, 6);
    expect(m.HAIR_NEAR).toBeGreaterThanOrEqual(m.RAY_INNER);
    expect(m.HAIR_FAR).toBeLessThan(900);
    for (let i = 1; i < x.length; i++) expect(x[i]).toBeGreaterThan(x[i - 1] + 2);
  });

  it("hairline heights: squared, varied by seeded weights, capped at 260 px", () => {
    expect(m.HAIR_MAX).toBe(260);
    const w = m.hairWeights(64, viz.mulberry32);
    expect(Array.from(m.hairWeights(64, viz.mulberry32))).toEqual(Array.from(w)); // seeded
    expect(Math.max(...w)).toBeLessThanOrEqual(1);
    expect(Math.min(...w)).toBeGreaterThan(0.3);
    expect(Math.max(...w) - Math.min(...w)).toBeGreaterThan(0.2); // they differ
    // a fully loud spectrum doesn't make every line the same height
    const h = m.hairHeights(new Array(64).fill(1), w, 1);
    expect(Math.max(...h)).toBeLessThanOrEqual(260);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(60);
    // twice the intensity is capped
    expect(Math.max(...m.hairHeights(new Array(64).fill(1), w, 2))).toBeLessThanOrEqual(260);
    expect(Array.from(m.hairHeights([0.5], [1], 1))).toEqual([65]);
    expect(Array.from(m.hairHeights([NaN, -2], [1, 1], 1))).toEqual([0, 0]);
  });

  it("hairline values are mirrored about the centre with the bass nearest the dish", () => {
    const spectrum = Array.from({ length: 32 }, (_, i) => 1 - i / 31);
    const v = viz.mirrorBars(spectrum, 64, false);
    expect(v[0]).toBeCloseTo(1, 6); // index 0 is the line nearest the dish, on both sides
    expect(v[0]).toBeGreaterThan(v[63]);
  });

  it("shooting stars: about one every 6 s, each a 0.6 s streak in the sky", () => {
    expect(m.SHOOT_EVERY).toBe(6);
    expect(m.SHOOT_LIFE).toBe(0.6);
    let streaks = 0;
    let on = false;
    let length = 0;
    for (let i = 0; i <= 600 * FPS; i++) {
      const s = m.shootingStar(i / FPS, viz.mulberry32);
      if (s) {
        if (!on) streaks++;
        length++;
        expect(s.alpha).toBeGreaterThanOrEqual(0);
        expect(s.alpha).toBeLessThanOrEqual(1);
        for (const [x, y] of [
          [s.x0, s.y0],
          [s.x1, s.y1],
        ]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1920);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(m.HORIZON_Y - 150);
        }
      } else if (on) {
        expect(length).toBeLessThanOrEqual(Math.ceil(0.6 * FPS) + 1);
        length = 0;
      }
      on = !!s;
    }
    expect(streaks).toBeGreaterThanOrEqual(70); // 100 slots of 6 s
    expect(streaks).toBeLessThanOrEqual(100);
  });

  it("shooting stars are seeded by the song time: a section matches the full song", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3.5));
    expect(section.songStart).toBe(1.5);
    for (let s = 0; s < 300; s += 0.05) {
      expect(m.shootingStar(s, viz.mulberry32)).toEqual(m.shootingStar(s, viz.mulberry32));
    }
    for (const t of [0, 0.4, 1.1, 1.9]) {
      expect(m.shootingStar(section.songStart + t, viz.mulberry32)).toEqual(
        m.shootingStar(whole.songStart + t + 1.5, viz.mulberry32),
      );
      expect(m.dishAim(section.songStart + t)).toBe(m.dishAim(t + 1.5));
    }
  });

  it("the sky: 900 seeded stars above the land, a few twinkling slowly; a seeded ridge", () => {
    const sky = m.buildSky(viz.mulberry32);
    expect(m.STAR_COUNT).toBe(900);
    expect(sky.stars.length).toBe(900 * m.STAR_STRIDE);
    expect(Array.from(m.buildSky(viz.mulberry32).stars)).toEqual(Array.from(sky.stars));
    let twinkling = 0;
    for (let i = 0; i < 900; i++) {
      const o = i * m.STAR_STRIDE;
      expect(sky.stars[o]).toBeGreaterThanOrEqual(0);
      expect(sky.stars[o]).toBeLessThanOrEqual(1920);
      expect(sky.stars[o + 1]).toBeGreaterThanOrEqual(0);
      expect(sky.stars[o + 1]).toBeLessThan(m.HORIZON_Y - 10);
      const a = m.starLevel(sky, i, 10);
      const b = m.starLevel(sky, i, 10 + 1 / FPS);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(Math.abs(a - b)).toBeLessThan(0.05); // slowly
      let lo = 1,
        hi = 0;
      for (let s = 0; s < 10; s += 0.25) {
        lo = Math.min(lo, m.starLevel(sky, i, s));
        hi = Math.max(hi, m.starLevel(sky, i, s));
      }
      if (hi - lo > 0.1) twinkling++;
    }
    expect(twinkling).toBeGreaterThan(10); // a few
    expect(twinkling).toBeLessThan(120);
    // the ridge: a height every RIDGE_STEP px across the frame, near the horizon, flat under the dish
    expect(sky.ridge.length).toBe(Math.round(1920 / m.RIDGE_STEP) + 1);
    for (let i = 0; i < sky.ridge.length; i++) {
      expect(sky.ridge[i]).toBeGreaterThan(m.HORIZON_Y - 40);
      expect(sky.ridge[i]).toBeLessThan(m.HORIZON_Y + 20);
      if (Math.abs(i * m.RIDGE_STEP - 960) <= 40)
        expect(Math.abs(sky.ridge[i] - m.HORIZON_Y)).toBeLessThan(3);
    }
  });

  it("the glow brightens 15 % with loudness; the streak and title follow gently", () => {
    expect(m.glowLevel(0)).toBe(1);
    expect(m.glowLevel(1)).toBeCloseTo(1.15, 9);
    expect(m.glowLevel(5)).toBeCloseTo(1.15, 9);
    expect(m.glowLevel(-1)).toBe(1);
    expect(m.streakLevel(1)).toBeGreaterThan(m.streakLevel(0));
    expect(m.streakLevel(0)).toBeGreaterThan(0);
    expect(m.titleScale(1, true)).toBeCloseTo(1.025, 9);
    expect(m.titleScale(1, false)).toBe(1);
    expect(m.titleScale(0, true)).toBe(1);
  });

  it("silence: no rays, no hairlines, no pulse, and no NaN anywhere", () => {
    const silent = viz.createAudio(silentData, { spectrumCount: 32 });
    const w = m.hairWeights(64, viz.mulberry32);
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const spec = silent.spectrum(t);
      const rays = m.rayLengths(viz.ringValues(spec, viz.ringAngles(90, 180), 180), 1);
      expect(Array.from(rays).every((x) => x === 0)).toBe(true);
      const hairs = m.hairHeights(viz.mirrorBars(spec, 64, false), w, 1);
      expect(Array.from(hairs).every((x) => x === 0)).toBe(true);
      const env = viz.beatEnvelope(silent, t, m.PULSE_RELEASE);
      expect(env).toBe(0);
      expect(m.titleScale(env, true)).toBe(1);
      expect(m.glowLevel(silent.sample(t).loud)).toBe(1);
      expect(Number.isFinite(m.streakLevel(silent.sample(t).loud))).toBe(true);
      for (const [x, y] of allPoints(m.dishShape(m.dishAim(t), m.dishTurn(t)))) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });
});
