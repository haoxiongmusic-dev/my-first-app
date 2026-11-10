// Silk Lights' motion maths (templates/silk-lights/assets/silk-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type RGB = [number, number, number];
type Spot = {
  u: number;
  y: number;
  rx: number;
  ry: number;
  speed: number;
  tone: number;
  alpha: number;
  band: number;
  freq: number;
  phase: number;
  streak: boolean;
};
type PlacedSpot = { x: number; y: number; rx: number; ry: number; tone: number; alpha: number };
type Pill = { index: number; x: number; y: number; w: number; h: number; row: number };
type PillLayout = { scale: number; rows: number; width: number; height: number; pills: Pill[] };
type Block = {
  top: number;
  cover: { x: number; y: number; size: number; r: number };
  bars: { x: number; bottom: number; count: number; max: number; width: number; gap: number };
  caption: { x: number; y: number; size: number; maxWidth: number };
  pills: { x: number; y: number; maxWidth: number };
  timer: { x: number; y: number } | null;
  bottom: number;
};
type Motion = {
  SLAB: { cx: number; cy: number; w: number; h: number };
  WAVE: { y: number; left: number; right: number; max: number; cap: number };
  TOP: { y: number; max: number };
  COVER: { x: number; size: number; r: number };
  MINI: { count: number; max: number; width: number; gap: number };
  PILL: { h: number; padX: number; gap: number; rowGap: number; maxWidth: number; size: number };
  BEAT_RELEASE: number;
  waveCount: (bandPct: number) => number;
  waveHeights: (values: ArrayLike<number>, intensity: number, max: number) => Float32Array;
  waveRipple: (count: number, songTime: number) => Float32Array;
  miniBars: (values: ArrayLike<number>, intensity: number) => Float32Array;
  glowSpots: (seed: number, mulberry32: VizToolkit["mulberry32"]) => Spot[];
  spotsAt: (
    spots: Spot[],
    songTime: number,
    spectrum: ArrayLike<number> | null,
    level: number,
  ) => PlacedSpot[];
  glowLevel: (loud: number, flux: number, env: number, intensity: number) => number;
  slabScale: (loud: number, flux: number) => number;
  edgeFade: (u: number) => number;
  coverScale: (env: number) => number;
  pillLayout: (textWidths: number[], maxWidth: number) => PillLayout;
  pillTint: (index: number, main: RGB, accent: RGB) => RGB;
  blockLayout: (pillRows: number, pillHeight: number, showTimer: boolean) => Block;
  textFade: (t: number) => number;
};
const m = require("../../templates/silk-lights/assets/silk-motion.js") as Motion;

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

function luminance(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

describe("Silk Lights motion", () => {
  it("places the glow slab, the wave lines, the cover and the mini bars as the spec says", () => {
    // a long soft slab across the middle: ≈ 70 % of the width, ≈ 25 % of the height
    expect(m.SLAB.w / 1920).toBeCloseTo(0.7, 2);
    expect(m.SLAB.h / 1080).toBeCloseTo(0.25, 2);
    expect(m.SLAB.cy).toBe(540);
    expect(m.SLAB.cx - m.SLAB.w / 2).toBeGreaterThan(0);
    expect(m.SLAB.cx + m.SLAB.w / 2).toBeLessThan(1920);
    // the wave line in the lower third, peaks up to ≈ 300 px (into the slab); the top copy
    expect(m.WAVE.y).toBeGreaterThan(720);
    expect(m.WAVE.max).toBe(300);
    expect(m.WAVE.y - m.WAVE.max).toBeLessThan(m.SLAB.cy + m.SLAB.h / 2);
    expect(m.WAVE.cap).toBeGreaterThanOrEqual(m.WAVE.max);
    expect(m.WAVE.y - m.WAVE.cap).toBeGreaterThan(m.SLAB.cy - m.SLAB.h / 2);
    expect(m.TOP.y).toBe(120);
    expect(m.TOP.max).toBeLessThan(m.WAVE.max / 2);
    // the cover: 290 px, corners 28 px, at x ≈ 70
    expect(m.COVER).toEqual({ x: 70, size: 290, r: 28 });
    // the mini spectrum: 40 hairline bars up to 70 px
    expect(m.MINI.count).toBe(40);
    expect(m.MINI.max).toBe(70);
    expect(m.BEAT_RELEASE).toBe(0.3);
  });

  it("the Bands setting picks how many points the wave line has", () => {
    expect(m.waveCount(100)).toBe(96);
    expect(m.waveCount(10)).toBe(19);
    expect(m.waveCount(65)).toBeGreaterThan(50);
    for (let pct = 11; pct <= 100; pct++) {
      expect(m.waveCount(pct)).toBeGreaterThanOrEqual(m.waveCount(pct - 1));
    }
    expect(m.waveCount(Number.NaN)).toBe(19);
  });

  it("the wave line is calm in silence: flat, no NaN", () => {
    const h = m.waveHeights(new Float32Array(66), 1, 300);
    expect(h).toHaveLength(66);
    expect(Array.from(h).every((v) => v === 0)).toBe(true);
    const nan = m.waveHeights([Number.NaN, -1, 0, 0], 1, 300);
    expect(Array.from(nan).every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });

  it("the wave line has distinct tall peaks, not a high plateau, when the music is loud", () => {
    // loud music: every band high (0.75..1), one region a little higher
    const values = Array.from(
      { length: 66 },
      (_, i) => 0.78 + 0.2 * Math.exp(-((i - 20) ** 2) / 30),
    );
    const h = Array.from(m.waveHeights(values, 1, 300));
    const top = Math.max(...h);
    expect(top).toBeGreaterThan(200); // a tall peak
    expect(top).toBeLessThanOrEqual(300);
    const median = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)];
    expect(median).toBeLessThan(top * 0.5); // most of the line stays calmer
    // the peak is where the spectrum is highest
    expect(h.indexOf(top)).toBeGreaterThan(14);
    expect(h.indexOf(top)).toBeLessThan(26);
  });

  it("the wave line is capped and meets its baseline at both ends", () => {
    const loud = new Array(66).fill(1);
    for (const intensity of [0.2, 1, 2, 5]) {
      const h = Array.from(m.waveHeights(loud, intensity, 300));
      expect(Math.max(...h)).toBeLessThanOrEqual(m.WAVE.cap + 1e-9);
      expect(h[0]).toBe(0);
      expect(h.at(-1)).toBe(0);
    }
    // quieter music gives lower peaks
    const soft = Array.from(m.waveHeights(new Array(66).fill(0.3), 1, 300));
    const hard = Array.from(m.waveHeights(new Array(66).fill(0.9), 1, 300));
    expect(Math.max(...soft)).toBeLessThan(Math.max(...hard));
  });

  it("a slow ripple rolls along the wave line, from the song time alone", () => {
    const a = Array.from(m.waveRipple(66, 61.25));
    expect(a).toHaveLength(66);
    expect(Array.from(m.waveRipple(66, 61.25))).toEqual(a);
    expect(a.every((v) => v >= 0.4 - 1e-9 && v <= 1 + 1e-9)).toBe(true);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.2); // it varies along the line
    // smooth from frame to frame
    const b = Array.from(m.waveRipple(66, 61.25 + 1 / 30));
    expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeLessThan(0.05);
    // a flat shelf of equally loud bands becomes rolling swells
    const shelf = m.waveHeights(new Array(66).fill(1), 1, 300);
    const rolled = Array.from(shelf).map((h, i) => h * a[i]);
    expect(Math.max(...rolled) - Math.min(...rolled.slice(6, 60))).toBeGreaterThan(60);
  });

  it("the mini bars follow the spectrum and are capped at 70 px", () => {
    expect(Array.from(m.miniBars(new Float32Array(40), 1)).every((v) => v === 0)).toBe(true);
    const ramp = Array.from({ length: 40 }, (_, i) => i / 39);
    const bars = Array.from(m.miniBars(ramp, 1));
    expect(bars.every((v, i) => i === 0 || v >= bars[i - 1])).toBe(true);
    expect(bars.at(-1)).toBeCloseTo(70, 6);
    for (const intensity of [1, 2, 4]) {
      const b = Array.from(m.miniBars(new Array(40).fill(1), intensity));
      expect(Math.max(...b)).toBeLessThanOrEqual(70);
    }
    const odd = Array.from(m.miniBars([Number.NaN, -2, 3], 1));
    expect(odd.every((v) => Number.isFinite(v) && v >= 0 && v <= 70)).toBe(true);
  });

  it("the glow's hot spots are seeded: the same every time, in both colours, some streaks", () => {
    const a = m.glowSpots(5, viz.mulberry32);
    expect(m.glowSpots(5, viz.mulberry32)).toEqual(a);
    expect(m.glowSpots(6, viz.mulberry32)).not.toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a.some((s) => s.streak)).toBe(true);
    expect(a.some((s) => !s.streak)).toBe(true);
    expect(a.some((s) => s.tone < 0.3)).toBe(true);
    expect(a.some((s) => s.tone > 0.7)).toBe(true);
    // they drift sideways at different speeds, mostly one way, a few the other
    const speeds = new Set(a.map((s) => s.speed));
    expect(speeds.size).toBe(a.length);
    expect(a.filter((s) => s.speed > 0).length).toBeGreaterThan(a.length / 2);
    expect(a.some((s) => s.speed < 0)).toBe(true);
  });

  it("hot spots drift from the time alone, stay in the slab's band and fade at its ends", () => {
    const spots = m.glowSpots(5, viz.mulberry32);
    const at = (s: number) => m.spotsAt(spots, s, null, 1);
    expect(at(12.5)).toEqual(at(12.5));
    const a = at(10),
      b = at(10 + 1 / 30);
    let moved = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].alpha > 0.01 && b[i].alpha > 0.01) {
        const dx = Math.abs(b[i].x - a[i].x);
        expect(dx).toBeLessThan(20); // smooth, no jumps between frames while visible
        if (dx > 0) moved++;
      }
    }
    expect(moved).toBeGreaterThan(5);
    const left = m.SLAB.cx - m.SLAB.w / 2,
      right = m.SLAB.cx + m.SLAB.w / 2;
    for (let s = 0; s < 400; s += 7.3) {
      for (const p of at(s)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.alpha)).toBe(true);
        expect(p.y).toBeGreaterThan(m.SLAB.cy - m.SLAB.h / 2);
        expect(p.y).toBeLessThan(m.SLAB.cy + m.SLAB.h / 2);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
        // dark at the ends: anything outside the slab is invisible
        if (p.x < left || p.x > right) expect(p.alpha).toBe(0);
      }
    }
    // brighter music, brighter spots
    const quiet = m.spotsAt(spots, 20, null, 0.4);
    const loud = m.spotsAt(spots, 20, null, 1);
    const sum = (l: PlacedSpot[]) => l.reduce((acc, p) => acc + p.alpha, 0);
    expect(sum(loud)).toBeGreaterThan(sum(quiet));
  });

  it("the spectrum lights its own hot spots, and silence still keeps a calm glow", () => {
    const spots = m.glowSpots(5, viz.mulberry32);
    const silent = m.spotsAt(spots, 20, new Float32Array(32), 1);
    const loud = m.spotsAt(spots, 20, new Float32Array(32).fill(1), 1);
    const sum = (l: PlacedSpot[]) => l.reduce((acc, p) => acc + p.alpha, 0);
    expect(sum(loud)).toBeGreaterThan(sum(silent));
    expect(sum(silent)).toBeGreaterThan(0);
  });

  it("the glow slab is dark at its ends and full in its middle", () => {
    expect(m.edgeFade(0)).toBe(0);
    expect(m.edgeFade(1)).toBe(0);
    expect(m.edgeFade(0.5)).toBe(1);
    expect(m.edgeFade(-1)).toBe(0);
    expect(m.edgeFade(2)).toBe(0);
    for (let u = 0; u < 0.5; u += 0.01) {
      expect(m.edgeFade(u + 0.01)).toBeGreaterThanOrEqual(m.edgeFade(u));
      expect(m.edgeFade(1 - u)).toBeCloseTo(m.edgeFade(u), 9);
    }
  });

  it("the glow brightens with loudness, flux and the beat, is visible in silence, and is capped", () => {
    const rest = m.glowLevel(0, 0, 0, 1);
    expect(rest).toBeGreaterThan(0.2);
    expect(m.glowLevel(0.8, 0, 0, 1)).toBeGreaterThan(rest);
    expect(m.glowLevel(0.8, 0.5, 0, 1)).toBeGreaterThan(m.glowLevel(0.8, 0, 0, 1));
    expect(m.glowLevel(0.8, 0.5, 1, 1)).toBeGreaterThan(m.glowLevel(0.8, 0.5, 0, 1));
    expect(m.glowLevel(1, 1, 1, 2)).toBeLessThanOrEqual(1.6);
    expect(m.glowLevel(5, 5, 5, 5)).toBeLessThanOrEqual(1.6);
    expect(Number.isFinite(m.glowLevel(Number.NaN, Number.NaN, Number.NaN, 1))).toBe(true);
    // the slab grows taller with the music, within limits
    expect(m.slabScale(0, 0)).toBeGreaterThan(0.6);
    expect(m.slabScale(1, 1)).toBeGreaterThan(m.slabScale(0, 0));
    expect(m.slabScale(5, 5)).toBeLessThanOrEqual(1.3);
  });

  it("the cover scales 1 + 0.025 × the beat", () => {
    expect(m.coverScale(0)).toBe(1);
    expect(m.coverScale(1)).toBeCloseTo(1.025, 9);
    expect(m.coverScale(4)).toBeCloseTo(1.025, 9);
    expect(m.coverScale(-1)).toBe(1);
  });

  it("tag pills fit: one row when they can, two at most, never wider than allowed", () => {
    const max = m.PILL.maxWidth;
    const three = m.pillLayout([80, 110, 120], max);
    expect(three.rows).toBe(1);
    expect(three.scale).toBe(1);
    expect(three.pills.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(three.pills[0].x).toBe(0);
    expect(three.pills[1].x).toBeCloseTo(three.pills[0].w + m.PILL.gap, 9);
    expect(three.pills[0].w).toBeCloseTo(80 + 2 * m.PILL.padX, 9);
    // five wrap onto two rows
    const five = m.pillLayout([110, 140, 150, 120, 130], max);
    expect(five.rows).toBe(2);
    expect(five.pills.filter((p) => p.row === 0).length).toBeGreaterThan(1);
    expect(five.pills[3].y).toBeGreaterThan(five.pills[0].y);
    // long tags shrink until they fit in two rows
    const long = m.pillLayout([400, 400, 400, 400, 400], max);
    expect(long.rows).toBeLessThanOrEqual(2);
    expect(long.scale).toBeLessThan(1);
    for (const layout of [three, five, long, m.pillLayout([2000], max)]) {
      for (const p of layout.pills) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(max + 1e-6);
        expect(p.row).toBeLessThan(2);
      }
      expect(layout.width).toBeLessThanOrEqual(max + 1e-6);
      expect(layout.height).toBeCloseTo(
        layout.rows * m.PILL.h * layout.scale + (layout.rows - 1) * m.PILL.rowGap * layout.scale,
        6,
      );
    }
    // no tags: nothing drawn, no height
    expect(m.pillLayout([], max)).toMatchObject({ rows: 0, height: 0, pills: [] });
  });

  it("each pill has its own tint from the two colours, dark enough for white text", () => {
    const main: RGB = [1, 0.184, 0.706];
    const acc: RGB = [0.184, 0.851, 1];
    const tints = [0, 1, 2, 3, 4].map((i) => m.pillTint(i, main, acc));
    const keys = new Set(tints.map((c) => c.map((v) => v.toFixed(3)).join(",")));
    expect(keys.size).toBe(5);
    for (const c of tints) {
      expect(c.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(luminance(c)).toBeLessThanOrEqual(0.45);
    }
    // even pale colours (the Mono preset) give pills white text can be read on
    const pale = [0, 1, 2, 3, 4].map((i) => m.pillTint(i, [0.91, 0.91, 0.94], [0.54, 0.54, 0.63]));
    for (const c of pale) expect(luminance(c)).toBeLessThanOrEqual(0.45);
  });

  it("the left block is centred vertically, stacked in order and stays inside the frame", () => {
    for (const rows of [0, 1, 2]) {
      for (const showTimer of [true, false]) {
        const b = m.blockLayout(
          rows,
          rows * m.PILL.h + Math.max(0, rows - 1) * m.PILL.rowGap,
          showTimer,
        );
        expect(b.cover.x).toBe(70);
        expect(b.cover.size).toBe(290);
        expect(b.top).toBeGreaterThan(40);
        expect(b.bottom).toBeLessThan(m.WAVE.y - 40);
        expect((b.top + b.bottom) / 2).toBeCloseTo(540, 0);
        expect(b.caption.y).toBeGreaterThan(b.cover.y + b.cover.size);
        expect(b.pills.y).toBeGreaterThan(b.caption.y);
        if (showTimer) expect(b.timer!.y).toBeGreaterThan(b.pills.y);
        else expect(b.timer).toBeNull();
        // the mini bars sit to the cover's lower right
        expect(b.bars.x).toBeGreaterThan(b.cover.x + b.cover.size);
        expect(b.bars.bottom).toBe(b.cover.y + b.cover.size);
        expect(b.bars.count).toBe(40);
        // the text and pills never reach the wave line's moving part
        expect(b.caption.x + b.caption.maxWidth).toBeLessThanOrEqual(m.WAVE.left);
        expect(b.pills.x + b.pills.maxWidth).toBeLessThanOrEqual(m.WAVE.left);
      }
    }
  });

  it("the text fades in at the start", () => {
    expect(m.textFade(0)).toBe(0);
    expect(m.textFade(0.3)).toBe(0);
    expect(m.textFade(1)).toBeGreaterThan(0.5);
    expect(m.textFade(1.9)).toBe(1);
    expect(m.textFade(100)).toBe(1);
  });

  it("a section draws the same glow and beat as the full song at the same song time", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3.5));
    const spots = m.glowSpots(5, viz.mulberry32);
    for (const t of [0.5, 0.9, 1.3, 1.7]) {
      expect(m.spotsAt(spots, section.songStart + t, null, 1)).toEqual(
        m.spotsAt(spots, t + 1.5, null, 1),
      );
      expect(viz.beatEnvelope(section, t, m.BEAT_RELEASE)).toBeCloseTo(
        viz.beatEnvelope(whole, t + 1.5, m.BEAT_RELEASE),
        6,
      );
      const a = section.sample(t),
        b = whole.sample(t + 1.5);
      expect(m.glowLevel(a.loud, a.flux, 0, 1)).toBeCloseTo(m.glowLevel(b.loud, b.flux, 0, 1), 9);
    }
  });
});
