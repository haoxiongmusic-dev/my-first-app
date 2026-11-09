// Afterglow's motion maths (templates/afterglow/assets/afterglow-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Box = { x: number; y: number; w: number; h: number };
type Text = { x: number; y: number; size: number; maxWidth: number; align: string };
type Layout = {
  name: string;
  line: { y: number; left: number; right: number; max: number };
  caption: Text | null;
  title: Text | null;
  artist: Text | null;
  bigTime: Text | null;
  times: { size: number; y: number; gap: number; under: boolean };
  progress: Box;
  card: (Box & { r: number }) | null;
};
type Light = { x: number; y: number; r: number; tone: number; alpha: number };
type Streak = { y: number; x0: number; x1: number; width: number; tone: number; alpha: number };
type Motion = {
  LINE_Y: number;
  LINE_LEFT: number;
  LINE_RIGHT: number;
  DOT_GAP: number;
  DOT_SIZE: number;
  BAR_WIDTH: number;
  BAR_MAX: number;
  BEAT_RELEASE: number;
  LAYOUTS: string[];
  pushScale: (songTime: number) => number;
  brightness: (env: number) => number;
  barCount: (bandPct: number, width: number) => number;
  barXs: (count: number, left: number, right: number) => Float32Array;
  dotXs: (left: number, right: number) => Float32Array;
  barLengths: (values: ArrayLike<number>, intensity: number, max: number) => Float32Array;
  spikes: (
    count: number,
    songTime: number,
    env: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => Float32Array;
  layout: (name: string) => Layout;
  progressFill: (fraction: number, width: number) => number;
  lightsLevel: (loud: number) => number;
  dimAlpha: (pct: number) => number;
  veil: (dim: number, loud: number) => number;
  glowLevel: (loud: number) => number;
  isPicture: (w: number, h: number) => boolean;
  textFade: (t: number) => number;
  cityLights: (
    seed: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => { bokeh: Light[]; streaks: Streak[] };
};
const m = require("../../templates/afterglow/assets/afterglow-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 4 s: a kick every half second from 1.0 s, loud with a falling spectrum from 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 60 ? Math.max(0, 1 - k / 20) : 0)),
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

describe("Afterglow motion", () => {
  it("the dotted line runs across the middle 70 % at y 540: 2 px dots every 6 px", () => {
    expect(m.LINE_Y).toBe(540);
    expect(m.LINE_LEFT).toBe(288);
    expect(m.LINE_RIGHT).toBe(1632);
    expect((m.LINE_RIGHT - m.LINE_LEFT) / 1920).toBeCloseTo(0.7, 9);
    expect(m.DOT_GAP).toBe(6);
    expect(m.DOT_SIZE).toBe(2);
    const dots = Array.from(m.dotXs(288, 1632));
    expect(dots[0]).toBe(288);
    expect(dots[1] - dots[0]).toBe(6);
    expect(dots.at(-1)).toBeLessThanOrEqual(1632 - 2);
    expect(dots.every((x, i) => i === 0 || x - dots[i - 1] === 6)).toBe(true);
  });

  it("the picture pushes in from 1 to 1.06 over 60 s and back, smoothly", () => {
    expect(m.pushScale(0)).toBeCloseTo(1, 9);
    expect(m.pushScale(60)).toBeCloseTo(1.06, 9);
    expect(m.pushScale(120)).toBeCloseTo(1, 9);
    expect(m.pushScale(30)).toBeCloseTo(1.03, 9);
    for (let s = 0; s < 240; s += 0.5) {
      const k = m.pushScale(s);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(1.06 + 1e-12);
      // smooth: no jumps between frames
      expect(Math.abs(m.pushScale(s + 1 / 30) - k)).toBeLessThan(0.0002);
    }
  });

  it("a beat lifts the overall brightness by up to 5 %", () => {
    expect(m.brightness(0)).toBe(1);
    expect(m.brightness(1)).toBeCloseTo(1.05, 9);
    expect(m.brightness(0.5)).toBeCloseTo(1.025, 9);
    expect(m.brightness(3)).toBeCloseTo(1.05, 9);
    expect(m.brightness(-1)).toBe(1);
  });

  it("the Bands setting picks the number of hairline bars, fewer on a shorter line", () => {
    const fullWidth = m.LINE_RIGHT - m.LINE_LEFT;
    expect(m.barCount(100, fullWidth)).toBe(112);
    expect(m.barCount(10, fullWidth)).toBe(22);
    expect(m.barCount(100, fullWidth / 2)).toBe(56);
    for (let pct = 11; pct <= 100; pct++) {
      expect(m.barCount(pct, fullWidth)).toBeGreaterThanOrEqual(m.barCount(pct - 1, fullWidth));
    }
    expect(m.barCount(10, 50)).toBeGreaterThanOrEqual(2);
  });

  it("bars are 2 px wide on whole pixels, spread from one end of the line to the other", () => {
    expect(m.BAR_WIDTH).toBe(2);
    const xs = Array.from(m.barXs(112, 288, 1632));
    expect(xs).toHaveLength(112);
    expect(xs[0]).toBe(288);
    expect(xs.at(-1)).toBe(1630);
    expect(xs.every((x) => Number.isInteger(x) && x % 2 === 0)).toBe(true);
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBe(true);
  });

  it("the bass is at the left end of the line", () => {
    const spectrum = Array.from({ length: 16 }, (_, i) => 1 - i / 15);
    const v = Array.from(viz.mirrorBars(spectrum, 9, false));
    expect(v[0]).toBeCloseTo(1, 6);
    expect(v[8]).toBeCloseTo(0, 6);
    expect(v.every((x, i) => i === 0 || x <= v[i - 1])).toBe(true);
  });

  it("bar lengths (each way) follow the square of the value, up to 180 px × intensity", () => {
    expect(m.BAR_MAX).toBe(180);
    expect(Array.from(m.barLengths([0, 0.5, 1], 1, m.BAR_MAX))).toEqual([0, 45, 180]);
    expect(Array.from(m.barLengths([0.5, 1, 2], 2, m.BAR_MAX))).toEqual([90, 360, 360]);
    expect(Array.from(m.barLengths([-1, Number.NaN], 1, m.BAR_MAX))).toEqual([0, 0]);
    expect(Array.from(m.barLengths([1], 1, 36))).toEqual([36]);
  });

  it("spikes make the bars sparse: a few tall ones at the bass end, many tiny ones", () => {
    let leftMean = 0,
      rightMean = 0,
      tallLeft = 0,
      samples = 0;
    for (let s = 60; s < 90; s += 0.25) {
      const w = Array.from(m.spikes(112, s, 1, viz.mulberry32));
      expect(w).toHaveLength(112);
      expect(w.every((x) => x >= 0 && x <= 1)).toBe(true);
      const sorted = [...w].sort((a, b) => a - b);
      expect(sorted[56], `median at ${s}`).toBeLessThan(0.35); // most bars are small
      leftMean += w.slice(0, 11).reduce((a, b) => a + b) / 11;
      rightMean += w.slice(56).reduce((a, b) => a + b) / 56;
      if (Math.max(...w.slice(0, 17)) > 0.6) tallLeft++;
      samples++;
    }
    expect(leftMean / samples).toBeGreaterThan(2 * (rightMean / samples));
    expect(tallLeft / samples).toBeGreaterThan(0.8); // the bass end nearly always has a tall spike
  });

  it("spikes come from the song time alone, move smoothly, and pump with the beat", () => {
    const a = Array.from(m.spikes(112, 75.5, 0.5, viz.mulberry32));
    expect(Array.from(m.spikes(112, 75.5, 0.5, viz.mulberry32))).toEqual(a);
    const next = Array.from(m.spikes(112, 75.5 + 1 / 30, 0.5, viz.mulberry32));
    expect(Math.max(...a.map((x, i) => Math.abs(x - next[i])))).toBeLessThan(0.45);
    const still = Array.from(m.spikes(112, 75.5, 0, viz.mulberry32));
    const beat = Array.from(m.spikes(112, 75.5, 1, viz.mulberry32));
    expect(beat.every((x, i) => x >= still[i])).toBe(true);
    expect(beat.reduce((s, x) => s + x)).toBeGreaterThan(1.3 * still.reduce((s, x) => s + x));
  });

  it("the progress bar fills left to right and stays inside its box", () => {
    expect(m.progressFill(0, 600)).toBe(0);
    expect(m.progressFill(0.5, 600)).toBe(300);
    expect(m.progressFill(1, 600)).toBe(600);
    expect(m.progressFill(1.5, 600)).toBe(600);
    expect(m.progressFill(Number.NaN, 600)).toBe(0);
  });

  it("the four layouts, and an unknown one falls back to classic", () => {
    expect(m.LAYOUTS).toEqual(["classic", "bigTitle", "bigTimer", "player"]);
    for (const name of m.LAYOUTS) expect(m.layout(name).name).toBe(name);
    expect(m.layout("nope").name).toBe("classic");
    const classic = m.layout("classic");
    expect(classic.line).toEqual({ y: 540, left: 288, right: 1632, max: 180 });
    expect(classic.caption).not.toBeNull();
    expect(classic.title).toBeNull();
    // bigTitle: the title is 110 px, above the line, the artist under it, the bar small
    const bigTitle = m.layout("bigTitle");
    expect(bigTitle.title?.size).toBe(110);
    expect(bigTitle.title!.y).toBeLessThan(bigTitle.line.y);
    expect(bigTitle.artist!.y).toBeGreaterThan(bigTitle.title!.y);
    expect(bigTitle.artist!.y).toBeLessThan(bigTitle.line.y);
    expect(bigTitle.progress.w).toBeLessThan(classic.progress.w);
    // bigTimer: the elapsed time is 150 px, under the line, the progress bar thin
    const bigTimer = m.layout("bigTimer");
    expect(bigTimer.bigTime?.size).toBe(150);
    expect(bigTimer.bigTime!.y).toBeGreaterThan(bigTimer.line.y);
    expect(bigTimer.progress.h).toBeLessThan(classic.progress.h);
    // player: a 900 × 260 card holding everything, the times at either end
    const player = m.layout("player");
    expect(player.card).toMatchObject({ w: 900, h: 260 });
    expect(player.times.under).toBe(true);
  });

  it("every layout stays inside the frame, and at intensity 1 the bars stay clear of the text", () => {
    for (const name of m.LAYOUTS) {
      const l = m.layout(name);
      const inside = (b: { x: number; y: number; w: number; h: number }) => {
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.y, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(1920);
        expect(b.y + b.h, name).toBeLessThanOrEqual(1080);
      };
      inside(l.progress);
      if (l.card) {
        inside(l.card);
        // the card holds the line, the progress bar and the text
        expect(l.line.left).toBeGreaterThan(l.card.x);
        expect(l.line.right).toBeLessThan(l.card.x + l.card.w);
        expect(l.line.y - l.line.max).toBeGreaterThan(l.card.y);
        expect(l.line.y + l.line.max).toBeLessThan(l.card.y + l.card.h);
        expect(l.progress.y + l.progress.h).toBeLessThan(l.card.y + l.card.h);
      }
      const top = l.line.y - l.line.max;
      const bottom = l.line.y + l.line.max;
      expect(top, name).toBeGreaterThan(0);
      expect(bottom, name).toBeLessThan(1080);
      for (const text of [l.caption, l.title, l.artist, l.bigTime]) {
        if (!text) continue;
        expect(text.maxWidth, name).toBeLessThanOrEqual(1700);
        const half = text.size * 0.6;
        // text sits clear of the bars' reach, above or below
        expect(text.y + half <= top || text.y - half >= bottom, `${name} text at ${text.y}`).toBe(
          true,
        );
      }
      expect(l.progress.y, name).toBeGreaterThan(bottom);
    }
  });

  it("the city lights swell with loudness; the dim setting is a fraction", () => {
    expect(m.lightsLevel(0)).toBeGreaterThan(0.4);
    expect(m.lightsLevel(1)).toBeGreaterThan(m.lightsLevel(0));
    expect(m.lightsLevel(1)).toBeLessThanOrEqual(1.5);
    expect(m.lightsLevel(1) - m.lightsLevel(0)).toBeGreaterThan(0.7); // a clear swell
    expect(m.lightsLevel(5)).toBe(m.lightsLevel(1));
    expect(m.lightsLevel(-1)).toBe(m.lightsLevel(0));
    expect(m.dimAlpha(35)).toBeCloseTo(0.35, 9);
    expect(m.dimAlpha(0)).toBe(0);
    expect(m.dimAlpha(150)).toBe(1);
    expect(m.dimAlpha(Number.NaN)).toBe(0);
  });

  it("loud music lifts the dim veil a little and brightens the horizon glow", () => {
    expect(m.veil(0.35, 0)).toBeCloseTo(0.35, 9);
    expect(m.veil(0.35, 1)).toBeLessThan(0.35);
    expect(m.veil(0.35, 1)).toBeGreaterThan(0.15); // the Dim setting still counts when loud
    expect(m.veil(0, 1)).toBe(0);
    expect(m.veil(0.35, 5)).toBe(m.veil(0.35, 1));
    expect(m.glowLevel(1)).toBeGreaterThan(2 * m.glowLevel(0));
    expect(m.glowLevel(5)).toBe(m.glowLevel(1));
    expect(m.glowLevel(-1)).toBe(m.glowLevel(0));
  });

  it("the tiny placeholder picture counts as no picture", () => {
    expect(m.isPicture(8, 8)).toBe(false);
    expect(m.isPicture(0, 0)).toBe(false);
    expect(m.isPicture(1920, 1080)).toBe(true);
    expect(m.isPicture(640, 480)).toBe(true);
  });

  it("the text fades in over the first two seconds", () => {
    expect(m.textFade(0)).toBe(0);
    expect(m.textFade(0.3)).toBe(0);
    expect(m.textFade(1)).toBeGreaterThan(0.5);
    expect(m.textFade(1.9)).toBe(1);
    expect(m.textFade(100)).toBe(1);
  });

  it("the night city's lights are seeded: the same every time, inside the frame, in both colours", () => {
    const a = m.cityLights(7, viz.mulberry32);
    expect(m.cityLights(7, viz.mulberry32)).toEqual(a);
    expect(m.cityLights(8, viz.mulberry32)).not.toEqual(a);
    expect(a.bokeh.length).toBeGreaterThan(30);
    expect(a.streaks.length).toBeGreaterThan(10);
    for (const b of a.bokeh) {
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(1080);
      expect(b.r).toBeGreaterThan(0);
      expect(b.alpha).toBeGreaterThan(0);
      expect(b.alpha).toBeLessThanOrEqual(1);
    }
    for (const s of a.streaks) {
      expect(s.x1).toBeGreaterThan(s.x0);
      expect(s.y).toBeGreaterThan(400);
      expect(s.y).toBeLessThan(1080);
      expect(s.width).toBeGreaterThan(0);
    }
    const tones = new Set([...a.bokeh, ...a.streaks].map((l) => l.tone));
    expect(tones.has(0)).toBe(true);
    expect(tones.has(1)).toBe(true);
  });

  it("a section's push-in, beat lift and clock match the full song at the same moment", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3.5));
    for (const t of [0.5, 0.9, 1.3, 1.7]) {
      expect(m.pushScale(section.songStart + t)).toBeCloseTo(m.pushScale(t + 1.5), 9);
      expect(viz.beatEnvelope(section, t, m.BEAT_RELEASE)).toBeCloseTo(
        viz.beatEnvelope(whole, t + 1.5, m.BEAT_RELEASE),
        6,
      );
      expect(viz.songClock(section, t)).toEqual(viz.songClock(whole, t + 1.5));
    }
  });

  it("silence gives a flat dotted line, no lift, with no NaN", () => {
    const silent = viz.createAudio(silentData, { spectrumCount: 32 });
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const values = viz.mirrorBars(silent.spectrum(t), 112, false);
      expect(Array.from(m.barLengths(values, 1, m.BAR_MAX)).every((x) => x === 0)).toBe(true);
      const env = viz.beatEnvelope(silent, t, m.BEAT_RELEASE);
      expect(m.brightness(env)).toBe(1);
      expect(m.lightsLevel(silent.sample(t).loud)).toBe(m.lightsLevel(0));
      expect(Number.isFinite(m.pushScale(silent.songStart + t))).toBe(true);
      expect(Number.isFinite(viz.songClock(silent, t).fraction)).toBe(true);
    }
  });
});
