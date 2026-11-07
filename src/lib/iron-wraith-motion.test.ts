// Iron Wraith's motion maths (templates/iron-wraith/assets/wraith-motion.js): everything is
// worked out from the song time alone, so any frame can be drawn on its own.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Audio = ReturnType<VizToolkit["createAudio"]>;
type Motion = {
  jawEnvelope: (audio: Audio, t: number) => number;
  jawAngle: (env: number, jawStrength: number, intensity: number) => number;
  nodAngle: (env: number, intensity: number) => number;
  eyeLevel: (audio: Audio, t: number, glow: number, intensity: number) => number;
  towerColumns: (
    audio: Audio,
    t: number,
    maxBlocks?: number,
  ) => { heights: number[]; peaks: number[] };
  waveformPoints: (
    values: Float32Array,
    width: number,
    baseline: number,
    amplitude: number,
  ) => Float32Array;
  bandsToCount: (pct: number) => number;
  thicknessToPx: (pct: number) => number;
  fitFontSize: (widthAtSize: number, size: number, safe: number) => number;
  previewLine: (widthPx: number, scale: number) => [number, number];
};
const m = require("../../templates/iron-wraith/assets/wraith-motion.js") as Motion;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 4 s at 30 fps: silent, a kick at 1.0 s, loud from 2.0 s with a rising spectrum, a hit at 2.0 s. */
function frames(): Frame[] {
  return Array.from({ length: 4 * FPS }, (_, i) => {
    const loud = i >= 60;
    return {
      b: Array.from({ length: 32 }, (_, k) => (loud ? Math.min(1, ((k + i) % 32) / 31) : 0)),
      l: loud ? 0.8 : 0,
      k: i === 30 ? 1 : 0,
      f: 0,
    };
  });
}

function analysis(fr: Frame[], extra: Partial<ToolkitAnalysis> = {}): ToolkitAnalysis {
  return {
    version: 1,
    fps: FPS,
    bands: 32,
    duration: fr.length / FPS,
    frames: fr,
    hits: [[2, 1]],
    ...extra,
  };
}

const audio = viz.createAudio(analysis(frames()));
const towers = viz.createAudio(analysis(frames()), { spectrumCount: 12 });

describe("jaw", () => {
  it("is shut in silence and opens on a beat", () => {
    expect(m.jawEnvelope(audio, 0.5)).toBe(0);
    expect(m.jawEnvelope(audio, 1.0)).toBeGreaterThan(0.9);
  });

  it("closes over about 0.18 s", () => {
    const e = m.jawEnvelope(audio, 1.18);
    expect(e).toBeGreaterThan(0.25);
    expect(e).toBeLessThan(0.5);
    expect(m.jawEnvelope(audio, 1.4)).toBe(0);
  });

  it("angle respects strength, intensity and the cap", () => {
    expect(m.jawAngle(1, 60, 1)).toBeCloseTo(0.18);
    expect(m.jawAngle(1, 100, 2)).toBe(0.45);
    expect(m.jawAngle(0, 100, 2)).toBe(0);
  });

  it("nods at most about 3.4 degrees", () => {
    expect(m.nodAngle(1, 1)).toBeCloseTo((2 * Math.PI) / 180);
    expect(m.nodAngle(1, 2)).toBe(0.06);
    expect(m.nodAngle(0, 2)).toBe(0);
  });
});

describe("section exports", () => {
  // A section starting at 1.0 s keeps 0.5 s of the song before it (offset), like the job builder.
  const section = viz.createAudio(analysis(frames().slice(15), { offset: 0.5 }));
  const sectionTowers = viz.createAudio(analysis(frames().slice(15), { offset: 0.5 }), {
    spectrumCount: 12,
  });

  it("look back safely at the very start", () => {
    for (const t of [0, 0.01, 0.1]) {
      expect(Number.isFinite(m.jawEnvelope(section, t))).toBe(true);
      expect(m.towerColumns(sectionTowers, t).heights.every(Number.isInteger)).toBe(true);
    }
  });

  it("match the full song at the same moment", () => {
    expect(m.jawEnvelope(section, 0.05)).toBeCloseTo(m.jawEnvelope(audio, 1.05), 6);
    expect(m.towerColumns(sectionTowers, 1.1)).toEqual(m.towerColumns(towers, 2.1));
  });
});

describe("eyes", () => {
  it("keep a base glow in silence", () => {
    expect(m.eyeLevel(audio, 0.5, 50, 1)).toBeCloseTo(0.35);
  });

  it("follow loudness and flare on a hit, fading over 0.4 s", () => {
    expect(m.eyeLevel(audio, 3.5, 0, 1)).toBeCloseTo(0.35 + 0.65 * 0.8);
    expect(m.eyeLevel(audio, 2.1, 100, 1)).toBeGreaterThan(m.eyeLevel(audio, 2.3, 100, 1));
    expect(m.eyeLevel(audio, 2.5, 100, 1)).toBeCloseTo(m.eyeLevel(audio, 2.5, 0, 1));
  });

  it("stay within limits", () => {
    for (const t of [0, 1, 2, 2.05, 3]) {
      const level = m.eyeLevel(audio, t, 100, 2);
      expect(level).toBeGreaterThanOrEqual(0.35);
      expect(level).toBeLessThanOrEqual(3);
    }
  });
});

describe("towers", () => {
  it("are whole blocks, flat in silence", () => {
    const quiet = m.towerColumns(towers, 0.5);
    expect(quiet.heights).toEqual(new Array(12).fill(0));
    expect(quiet.peaks).toEqual(new Array(12).fill(0));
  });

  it("peaks sit on or above the bars", () => {
    const now = m.towerColumns(towers, 2.5);
    expect(now.heights.every(Number.isInteger)).toBe(true);
    expect(now.heights.some((h) => h > 0)).toBe(true);
    for (let i = 0; i < 12; i++) {
      expect(now.peaks[i]).toBeGreaterThanOrEqual(now.heights[i]);
      expect(now.peaks[i]).toBeLessThanOrEqual(18);
    }
  });

  it("are the same for the same time", () => {
    expect(m.towerColumns(towers, 2.3)).toEqual(m.towerColumns(towers, 2.3));
  });
});

describe("waveform", () => {
  it("points are mirrored around the centre", () => {
    const p = m.waveformPoints(new Float32Array([0.2, 0.5, 1]), 1920, 900, 100);
    expect(p.length).toBe(12);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = n - 1 - i;
      expect(p[2 * i] + p[2 * j]).toBeCloseTo(1920);
      expect(p[2 * i + 1]).toBeCloseTo(p[2 * j + 1]);
    }
    expect(Math.min(...Array.from(p).filter((_, i) => i % 2 === 1))).toBeCloseTo(800);
  });

  it("band and thickness percentages map to the spec's ranges", () => {
    expect(m.bandsToCount(10)).toBe(16);
    expect(m.bandsToCount(100)).toBe(160);
    expect(m.thicknessToPx(2)).toBe(0.75);
    expect(m.thicknessToPx(110)).toBeCloseTo(13.2);
    expect(m.thicknessToPx(7)).toBeCloseTo(0.84);
  });

  it("long titles shrink to fit the safe width, short ones keep their size", () => {
    expect(m.fitFontSize(3000, 34, 1536)).toBeLessThanOrEqual(Math.floor((34 * 1536) / 3000));
    expect(m.fitFontSize(3000, 34, 1536)).toBeGreaterThanOrEqual(
      Math.floor((34 * 1536) / 3000) - 1,
    );
    expect(m.fitFontSize(1000, 34, 1536)).toBe(34);
    expect(m.fitFontSize(1e6, 34, 1536)).toBe(1);
  });

  it("a wave line in the preview is at least one screen pixel, fainter instead of thinner", () => {
    expect(m.previewLine(0.75, 1)).toEqual([0.75, 1]); // exports unchanged
    const thin = m.previewLine(0.75, 1 / 3);
    expect(thin[0]).toBeCloseTo(1, 9);
    expect(thin[1]).toBeCloseTo(0.25, 9);
    const wide = m.previewLine(6, 1 / 3);
    expect(wide[0]).toBeCloseTo(2, 9);
    expect(wide[1]).toBe(1);
  });
});
