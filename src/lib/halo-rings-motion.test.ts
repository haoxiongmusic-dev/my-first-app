// Halo Rings' motion maths (templates/halo-rings/assets/halo-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Ring = { radius: number; full: number; spin: number };
type Motion = {
  RINGS: Ring[];
  BAR_SCALE: number;
  BAR_MAX: number;
  PULSE_RELEASE: number;
  ringThird: (spectrum: ArrayLike<number>, ring: number) => Float32Array;
  barLengths: (values: ArrayLike<number>, intensity: number) => Float32Array;
  spinAngle: (ring: number, songTime: number, spinPct: number) => number;
  pulseScale: (env: number, intensity: number, on: boolean) => number;
  shakeOffset: (
    env: number,
    intensity: number,
    songTime: number,
    on: boolean,
    mulberry32: (seed: number) => () => number,
  ) => [number, number];
  glowLevel: (loud: number) => number;
  previewDot: (
    x: number,
    y: number,
    size: number,
    scale: number,
  ) => [number, number, number, number];
  buildSky: (mulberry32: (seed: number) => () => number) => {
    ridges: Float32Array[];
    stars: Float32Array;
  };
};
const m = require("../../templates/halo-rings/assets/halo-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const DEG = Math.PI / 180;

/** 4 s: a kick every half second from 1.0 s, loud with a rising spectrum from 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 60 ? Math.min(1, ((k + i) % 32) / 31) : 0)),
    l: i >= 60 ? 0.8 : 0,
    k: i >= 30 && i % 15 === 0 ? 1 : 0,
    f: 0,
  }));
}
function analysis(fr: Frame[]): ToolkitAnalysis {
  return { version: 1, fps: FPS, bands: 32, duration: fr.length / FPS, frames: fr, hits: [] };
}
const full = analysis(frames());
const silentData = analysis(
  Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
);

describe("Halo Rings motion", () => {
  it("each ring reads its own third of the spectrum", () => {
    const v = Array.from({ length: 12 }, (_, i) => i);
    expect(Array.from(m.ringThird(v, 0))).toEqual([0, 1, 2, 3]);
    expect(Array.from(m.ringThird(v, 1))).toEqual([4, 5, 6, 7]);
    expect(Array.from(m.ringThird(v, 2))).toEqual([8, 9, 10, 11]);
  });

  it("a one- or two-band window still gives every ring a value, never NaN", () => {
    for (const v of [[0.4, 0.9], [0.7]]) {
      for (let r = 0; r < 3; r++) {
        const third = Array.from(m.ringThird(v, r));
        expect(third.length).toBeGreaterThan(0);
        expect(third.every((x) => Number.isFinite(x))).toBe(true);
      }
    }
    expect(m.ringThird([0.7], 2)[0]).toBeCloseTo(0.7, 6);
  });

  it("bar lengths follow the square of the value (peaks stand out), cap at 56 px", () => {
    expect(Array.from(m.barLengths([0, 0.5, 2], 1))).toEqual([0, 14, 56]);
    expect(Array.from(m.barLengths([0, 0.5, 2], 2))).toEqual([0, 28, 56]);
  });

  it("rings spin by time only, in opposite directions", () => {
    expect(m.spinAngle(0, 1, 100)).toBeCloseTo(2 * DEG, 9);
    expect(m.spinAngle(1, 1, 100)).toBeCloseTo(-1.5 * DEG, 9);
    expect(m.spinAngle(2, 2, 50)).toBeCloseTo(1 * DEG, 9);
    expect(m.spinAngle(0, 10, 0)).toBe(0);
    expect(m.spinAngle(2, 7.3, 140)).toBe(m.spinAngle(2, 7.3, 140));
  });

  it("the pulse scales up to 5 % per unit of intensity, only when switched on", () => {
    expect(m.pulseScale(1, 1, true)).toBeCloseTo(1.05, 9);
    expect(m.pulseScale(0, 2, true)).toBe(1);
    expect(m.pulseScale(1, 2, false)).toBe(1);
  });

  it("the shake is 8 px at a full beat, seeded by song time, off when switched off", () => {
    expect(m.shakeOffset(1, 1, 3.2, false, viz.mulberry32)).toEqual([0, 0]);
    expect(m.shakeOffset(0, 1, 3.2, true, viz.mulberry32)).toEqual([0, 0]);
    const s = m.shakeOffset(1, 1, 3.2, true, viz.mulberry32);
    expect(Math.hypot(s[0], s[1])).toBeCloseTo(8, 9);
    expect(m.shakeOffset(1, 1, 3.2, true, viz.mulberry32)).toEqual(s);
  });

  it("a section shakes exactly like the full song at the same moment", () => {
    const whole = viz.createAudio(full);
    const section = viz.createAudio(sliceAnalysis(full, 1.5, 3));
    const at = (audio: typeof whole, t: number) =>
      m.shakeOffset(
        viz.beatEnvelope(audio, t, m.PULSE_RELEASE),
        1,
        t + audio.songStart,
        true,
        viz.mulberry32,
      );
    const a = at(section, 0.5);
    const b = at(whole, 2.0);
    expect(Math.hypot(...b)).toBeGreaterThan(1);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it("a section's shake matches the full song on every frame", () => {
    // a section starting at 7.4 s: its frame i is the full song's frame 222 + i
    for (let i = 0; i <= 900; i++) {
      expect(m.shakeOffset(1, 1, 7.4 + i / 30, true, viz.mulberry32)).toEqual(
        m.shakeOffset(1, 1, (222 + i) / 30, true, viz.mulberry32),
      );
    }
  });

  it("preview dots are at least one screen pixel, centred on a pixel, with matched brightness", () => {
    expect(m.previewDot(100.3, 200.7, 3, 1)).toEqual([100.3, 200.7, 3, 1]); // exports unchanged
    const third = 1 / 3;
    const [x, y, size, gain] = m.previewDot(100.3, 200.7, 3, third);
    expect(size).toBeCloseTo(3, 9);
    expect(gain).toBeCloseTo(1, 9);
    for (const v of [x, y]) {
      const pixel = v * third - 0.5;
      expect(Math.abs(pixel - Math.round(pixel))).toBeLessThan(1e-9);
    }
    const small = m.previewDot(50, 50, 2, third);
    expect(small[2]).toBeCloseTo(3, 9);
    expect(small[3]).toBeCloseTo((2 / 3) ** 2, 9);
  });

  it("the outer ring stays inside the frame at the strongest pulse and shake", () => {
    const outer = m.RINGS[2].radius;
    const pulse = m.pulseScale(1, 2, true);
    const reach = outer * pulse + m.BAR_MAX * pulse + 8 * 2;
    expect(reach).toBeLessThan(520); // the centre is 520 px from the top of the frame
    // the rounded square touches the unit circle at its sides (angle 0, the top); its corners
    // reach further (about 1.19 at 45°) but only about 0.84 of that upward, so the top side is
    // still its highest point and this bound covers both shapes
    const [x, y] = viz.ringPoint(0, "rounded");
    expect(Math.hypot(x, y)).toBeCloseTo(1, 9);
  });

  it("at 10 % bands every ring still closes, evenly spaced", () => {
    for (const ring of m.RINGS) {
      const count = viz.bandsToRingCount(10, ring.full);
      expect(count).toBeGreaterThanOrEqual(14);
      const a = Array.from(viz.ringAngles(count, 360));
      const gap = (2 * Math.PI) / count;
      for (let i = 1; i < count; i++) expect(a[i] - a[i - 1]).toBeCloseTo(gap, 5);
      expect(a[0] + 2 * Math.PI - a[count - 1]).toBeCloseTo(gap, 5); // closes the loop
    }
  });

  it("the sky is the same every time: three ridges and 300 stars in the top 60 %", () => {
    const a = m.buildSky(viz.mulberry32);
    expect(m.buildSky(viz.mulberry32)).toEqual(a);
    expect(a.ridges).toHaveLength(3);
    const bases = [700, 760, 840];
    const amps = [60, 80, 110];
    a.ridges.forEach((ridge, i) => {
      expect(ridge).toHaveLength(97);
      for (const y of Array.from(ridge)) {
        expect(Math.abs(y - bases[i])).toBeLessThanOrEqual(amps[i] + 1e-6);
      }
    });
    expect(a.stars).toHaveLength(300 * 4);
    for (let s = 0; s < 300; s++) {
      const [x, y, size, bright] = Array.from(a.stars.slice(4 * s, 4 * s + 4));
      expect(x >= 0 && x < 1920 && y >= 0 && y < 648).toBe(true);
      expect(size >= 1 && size <= 2.2).toBe(true);
      expect(bright >= 0.3 && bright <= 1).toBe(true);
    }
  });

  it("silence gives no bars, no pulse and no shake, with no NaN", () => {
    const silent = viz.createAudio(silentData, { spectrumCount: 30 });
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const spec = silent.spectrum(t);
      for (let r = 0; r < 3; r++) {
        const lengths = Array.from(m.barLengths(m.ringThird(spec, r), 1));
        expect(lengths.every((x) => x === 0)).toBe(true);
      }
      const env = viz.beatEnvelope(silent, t, m.PULSE_RELEASE);
      expect(env).toBe(0);
      expect(m.shakeOffset(env, 1, t, true, viz.mulberry32)).toEqual([0, 0]);
      expect(m.glowLevel(silent.sample(t).loud)).toBeCloseTo(0.6, 9);
    }
  });
});
