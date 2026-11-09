// Red Letter's motion maths (templates/red-letter/assets/letter-motion.js): worked out from the
// song time alone, so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Rng = (seed: number) => () => number;
type Placed = { ch: string; x: number; y: number; w: number; slot: number };
type TitleLayout = {
  size: number;
  lines: string[];
  chars: Placed[];
  left: number;
  right: number;
  top: number;
  bottom: number;
};
type Speck = { x: number; y: number; r: number; light: number };
type Scratch = { x: number; y0: number; y1: number; width: number; light: number };
type Motion = {
  BEAT_RELEASE: number;
  REST_GREY: number;
  SCOPE_MAX: number;
  GLITCH_MIN: number;
  GLITCH_MAX: number;
  STRONG_BEAT: number;
  WEAR_RATE: number;
  GRAIN_MAX: number;
  TITLE_SAFE: number;
  TITLE_MAX: number;
  CENTRE_Y: number;
  letterSlots: (text: string) => number[];
  redSlot: (audio: ToolkitAudio, t: number, count: number, rng: Rng) => number;
  letterFlash: (env: number, intensity: number) => number;
  letterColor: (main: number[], flash: number) => number[];
  redColor: (accent: number[], flash: number) => number[];
  glitchOffsets: (
    audio: ToolkitAudio,
    t: number,
    count: number,
    on: boolean,
    rng: Rng,
  ) => Float32Array;
  scopeCount: (bandPct: number) => number;
  scopeHeights: (
    values: ArrayLike<number>,
    songTime: number,
    intensity: number,
    seed: number,
    rng: Rng,
  ) => Float32Array;
  exposure: (loud: number, intensity: number) => number;
  wearEpoch: (songTime: number) => number;
  grainAmount: (pct: number) => number;
  filmWear: (
    epoch: number,
    pct: number,
    rng: Rng,
  ) => { scratches: Scratch[]; specks: Speck[]; flicker: number };
  textFade: (t: number) => number;
  placeTitle: (text: string, charWidth: (ch: string) => number, capHeight: number) => TitleLayout;
  artistSize: (titleSize: number, width100: number) => number;
};
const m = require("../../templates/red-letter/assets/letter-motion.js") as Motion;
const rng = viz.mulberry32 as Rng;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;
const SECONDS = 40;
/** Beats every half second from 1.0 s, every other one strong (1.0) and the rest soft (0.4). */
const HITS: [number, number][] = Array.from({ length: 2 * (SECONDS - 2) }, (_, i) => [
  1 + i * 0.5,
  i % 2 === 0 ? 1 : 0.4,
]);

/** Quiet for 2 s, then loud with a rising spectrum. */
function frames(): Frame[] {
  return Array.from({ length: SECONDS * FPS }, (_, i) => ({
    b: Array.from({ length: 32 }, (_, k) => (i >= 60 ? Math.min(1, ((k + i) % 32) / 31) : 0)),
    l: i >= 60 ? 0.8 : 0,
    k: HITS.some(([t]) => Math.round(t * FPS) === i) ? 1 : 0,
    f: i >= 60 ? 0.4 : 0,
  }));
}
function analysis(fr: Frame[], hits: [number, number][]): ToolkitAnalysis {
  return { version: 1, fps: FPS, bands: 32, duration: fr.length / FPS, frames: fr, hits };
}
const full = analysis(frames(), HITS);
const silentData = analysis(
  Array.from({ length: 3 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
  [],
);
const whole = viz.createAudio(full);
const silent = viz.createAudio(silentData, { spectrumCount: 32 });
const EPS = 0.001; // just after a beat

describe("Red Letter motion: the red letter", () => {
  it("only letters and digits can be red, never a space or a dash", () => {
    expect(m.letterSlots("SONG NAME")).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(m.letterSlots("A - B")).toEqual([0, 4]);
    expect(m.letterSlots("ÉTÉ 2")).toEqual([0, 1, 2, 4]);
    // a title of only signs still has something to colour; an empty one has nothing
    expect(m.letterSlots("!?")).toEqual([0, 1]);
    expect(m.letterSlots("   ")).toEqual([]);
    expect(m.letterSlots("")).toEqual([]);
  });

  it("before the first beat it is letter 1", () => {
    for (const t of [0, 0.3, 0.99]) expect(m.redSlot(whole, t, 8, rng)).toBe(0);
    for (let i = 0; i <= 30; i++) expect(m.redSlot(silent, i / 10, 8, rng)).toBe(0);
    // one letter, or none: nothing to choose
    expect(m.redSlot(whole, 5, 1, rng)).toBe(0);
    expect(m.redSlot(whole, 5, 0, rng)).toBe(0);
  });

  it("moves on every beat, never to the same letter twice in a row, and stays put between beats", () => {
    for (const count of [3, 4, 5, 8, 12, 30]) {
      let previous = m.redSlot(whole, HITS[0][0] - EPS, count, rng);
      expect(previous).toBe(0);
      const seen = new Set<number>();
      for (const [beat] of HITS) {
        const slot = m.redSlot(whole, beat + EPS, count, rng);
        expect(slot, `count ${count} at ${beat}`).not.toBe(previous);
        expect(Number.isInteger(slot)).toBe(true);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(count);
        // until the next beat it doesn't change
        for (const dt of [0.1, 0.25, 0.45])
          expect(m.redSlot(whole, beat + dt, count, rng)).toBe(slot);
        seen.add(slot);
        previous = slot;
      }
      // it travels: every letter of a short title gets its turn
      if (count <= 8) expect(seen.size).toBe(count);
    }
  });

  it("is chosen by the song time alone: the same every time and in a section", () => {
    const a = HITS.map(([b]) => m.redSlot(whole, b + EPS, 8, rng));
    expect(HITS.map(([b]) => m.redSlot(whole, b + EPS, 8, rng))).toEqual(a);
    for (const start of [5, 12.25, 20]) {
      const section = viz.createAudio(sliceAnalysis(full, start, start + 10));
      for (let i = 0; i <= 200; i++) {
        const t = i * 0.05;
        expect(m.redSlot(section, t, 8, rng), `section ${start} at ${t}`).toBe(
          m.redSlot(whole, start + t, 8, rng),
        );
      }
    }
  });
});

describe("Red Letter motion: beats on frame boundaries", () => {
  it("a beat exactly on a frame counts from that frame, in a section too", () => {
    // beat times rounded to 1 ms, like the analyzer's, many landing exactly on frames
    const hits: [number, number][] = Array.from({ length: 60 }, (_, i) => [
      Math.round((1 + i * 0.3 + (i % 3) * 0.0333) * 1000) / 1000,
      i % 2 ? 1 : 0.5,
    ]);
    const song = analysis(frames(), hits);
    const all = viz.createAudio(song);
    for (const start of [3.7, 7.1, 11.9, 13.3]) {
      const section = viz.createAudio(sliceAnalysis(song, start, start + 4));
      for (let f = 0; f < 4 * FPS; f++) {
        const t = f / FPS;
        expect(m.redSlot(section, t, 8, rng), `${start} + ${t}`).toBe(
          m.redSlot(all, start + t, 8, rng),
        );
        expect(Array.from(m.glitchOffsets(section, t, 8, true, rng))).toEqual(
          Array.from(m.glitchOffsets(all, start + t, 8, true, rng)),
        );
      }
    }
  });
});

describe("Red Letter motion: brightness and glitch", () => {
  it("letters flash toward white on the beat and settle at 70 % of the main colour", () => {
    expect(m.BEAT_RELEASE).toBe(0.15);
    expect(m.REST_GREY).toBe(0.7);
    expect(m.letterFlash(0, 1)).toBe(0);
    expect(m.letterFlash(1, 1)).toBe(1);
    expect(m.letterFlash(0.5, 1)).toBeCloseTo(0.5, 9);
    expect(m.letterFlash(0.5, 0.2)).toBeCloseTo(0.1, 9);
    expect(m.letterFlash(1, 2)).toBe(1); // capped
    expect(m.letterFlash(-1, 1)).toBe(0);
    const main = [0.9, 0.9, 0.9];
    m.letterColor(main, 0).forEach((c) => expect(c).toBeCloseTo(0.63, 9));
    m.letterColor(main, 1).forEach((c) => expect(c).toBeCloseTo(1, 9));
    // the red letter stays red: only a little whiter on the flash
    const red = m.redColor([1, 0.16, 0.16], 1);
    expect(red[0]).toBeCloseTo(1, 9);
    expect(red[1]).toBeLessThan(0.5);
    expect(m.redColor([1, 0.16, 0.16], 0)).toEqual([1, 0.16, 0.16]);
    // the envelope from the toolkit settles after a beat
    expect(viz.beatEnvelope(whole, 1 + EPS, m.BEAT_RELEASE)).toBeGreaterThan(0.9);
    expect(viz.beatEnvelope(whole, 1.45, m.BEAT_RELEASE)).toBe(0);
  });

  it("on strong beats a few letters jump 4–12 px sideways for two frames", () => {
    expect(m.STRONG_BEAT).toBe(0.7);
    const strong = HITS.filter(([, s]) => s >= m.STRONG_BEAT).map(([b]) => b);
    expect(strong.length).toBeGreaterThan(10);
    for (const beat of strong) {
      for (const frame of [0, 1]) {
        const offsets = m.glitchOffsets(whole, beat + frame / FPS, 9, true, rng);
        const moved = Array.from(offsets).filter((x) => x !== 0);
        expect(moved.length, `${beat} frame ${frame}`).toBeGreaterThanOrEqual(2);
        expect(moved.length).toBeLessThanOrEqual(4);
        for (const x of moved) {
          expect(Math.abs(x)).toBeGreaterThanOrEqual(m.GLITCH_MIN);
          expect(Math.abs(x)).toBeLessThanOrEqual(m.GLITCH_MAX);
        }
      }
      // the third frame is still again
      const after = m.glitchOffsets(whole, beat + 2 / FPS, 9, true, rng);
      expect(Array.from(after).every((x) => x === 0)).toBe(true);
    }
    // seeded by the frame: two frames of one beat differ, and the same frame repeats
    const a = m.glitchOffsets(whole, strong[3], 9, true, rng);
    const b = m.glitchOffsets(whole, strong[3] + 1 / FPS, 9, true, rng);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(Array.from(m.glitchOffsets(whole, strong[3], 9, true, rng))).toEqual(Array.from(a));
  });

  it("soft beats, the off switch and silence never glitch", () => {
    const soft = HITS.filter(([, s]) => s < m.STRONG_BEAT).map(([b]) => b);
    for (const beat of soft) {
      expect(Array.from(m.glitchOffsets(whole, beat, 9, true, rng)).every((x) => x === 0)).toBe(
        true,
      );
    }
    for (const [beat] of HITS) {
      expect(Array.from(m.glitchOffsets(whole, beat, 9, false, rng)).every((x) => x === 0)).toBe(
        true,
      );
    }
    for (let i = 0; i <= 30; i++) {
      const g = m.glitchOffsets(silent, i / 10, 9, true, rng);
      expect(Array.from(g).every((x) => x === 0)).toBe(true);
    }
    // a title too short for a few letters to move: only the letters there are
    const two = m.glitchOffsets(whole, 1, 2, true, rng);
    expect(two.length).toBe(2);
  });

  it("a section's glitch matches the full song at the same moment", () => {
    const section = viz.createAudio(sliceAnalysis(full, 6, 12));
    for (let f = 0; f < 6 * FPS; f++) {
      const t = f / FPS;
      expect(Array.from(m.glitchOffsets(section, t, 9, true, rng))).toEqual(
        Array.from(m.glitchOffsets(whole, 6 + t, 9, true, rng)),
      );
    }
  });
});

describe("Red Letter motion: the scope line", () => {
  it("the Bands setting picks 24 to 120 points a side", () => {
    expect(m.scopeCount(100)).toBe(120);
    expect(m.scopeCount(10)).toBe(24);
    for (let pct = 11; pct <= 100; pct++) {
      expect(m.scopeCount(pct)).toBeGreaterThanOrEqual(m.scopeCount(pct - 1));
    }
  });

  it("is flat in silence", () => {
    for (let i = 0; i <= 30; i++) {
      const t = i / 10;
      const values = viz.scopeLine(silent, t, 120, 11);
      const h = m.scopeHeights(values, silent.songStart + t, 1, 11, rng);
      expect(Array.from(h).every((x) => x === 0)).toBe(true);
    }
  });

  it("is spiky when loud: a few tall spikes, most points small, tallest next to the title", () => {
    expect(m.SCOPE_MAX).toBe(160);
    let tall = 0,
      small = 0,
      total = 0,
      near = 0,
      far = 0;
    for (let i = 0; i < 60; i++) {
      const t = 3 + i / FPS;
      // everything at full height, like a strong boost on loud music
      const values = Float32Array.from(viz.scopeLine(whole, t, 120, 11), (v) => (v < 0 ? -1 : 1));
      const h = m.scopeHeights(values, t, 1, 11, rng);
      for (let k = 0; k < h.length; k++) {
        const a = Math.abs(h[k]);
        expect(Number.isFinite(a)).toBe(true);
        expect(a).toBeLessThanOrEqual(m.SCOPE_MAX);
        if (a > 0.4 * m.SCOPE_MAX) tall++;
        if (a < 0.15 * m.SCOPE_MAX) small++;
        if (k < 30) near += a;
        if (k >= 90) far += a;
        total++;
      }
    }
    expect(tall / total).toBeGreaterThan(0.03);
    expect(tall / total).toBeLessThan(0.3);
    expect(small / total).toBeGreaterThan(0.6);
    expect(near).toBeGreaterThan(2 * far);
  });

  it("spikes grow with intensity and stay under 160 px × intensity", () => {
    const values = new Float32Array(120).fill(1);
    const one = m.scopeHeights(values, 5, 1, 11, rng);
    const two = m.scopeHeights(values, 5, 2, 11, rng);
    for (let k = 0; k < 120; k++) {
      expect(two[k]).toBeCloseTo(2 * one[k], 4);
      expect(Math.abs(two[k])).toBeLessThanOrEqual(2 * m.SCOPE_MAX);
    }
  });

  it("is seeded by the song frame: a section matches the full song", () => {
    const section = viz.createAudio(sliceAnalysis(full, 4, 9));
    for (const t of [0.5, 1.2, 3.3]) {
      const s = m.scopeHeights(viz.scopeLine(section, t, 120, 11), 4 + t, 1, 11, rng);
      const w = m.scopeHeights(viz.scopeLine(whole, 4 + t, 120, 11), 4 + t, 1, 11, rng);
      expect(Array.from(s)).toEqual(Array.from(w));
    }
    // the next frame is different
    const a = m.scopeHeights(new Float32Array(120).fill(1), 5, 1, 11, rng);
    const b = m.scopeHeights(new Float32Array(120).fill(1), 5 + 1 / FPS, 1, 11, rng);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("Red Letter motion: the film", () => {
  it("the film's exposure lifts with the music, and is calm and finite in silence", () => {
    expect(m.exposure(0, 1)).toBeGreaterThan(0.5);
    expect(m.exposure(1, 1)).toBeGreaterThan(m.exposure(0, 1) + 0.2);
    expect(m.exposure(1, 2)).toBeGreaterThan(m.exposure(1, 1));
    expect(m.exposure(5, 2)).toBe(m.exposure(1, 2)); // clamped
    expect(Number.isFinite(m.exposure(NaN, 1))).toBe(true);
  });

  it("scratches, dust and grain change at most 6 times a second", () => {
    expect(m.WEAR_RATE).toBeLessThanOrEqual(6);
    expect(m.wearEpoch(0)).toBe(0);
    expect(m.wearEpoch(1 / 6 - 0.001)).toBe(0);
    expect(m.wearEpoch(1)).toBe(6);
    expect(m.wearEpoch(10.5)).toBe(63);
    const a = m.filmWear(42, 50, rng);
    expect(m.filmWear(42, 50, rng)).toEqual(a);
    expect(m.filmWear(43, 50, rng)).not.toEqual(a);
  });

  it("the grain setting scales grain, scratches, dust and flicker: none at 0 %, grain at most 0.02", () => {
    expect(m.GRAIN_MAX).toBe(0.02);
    expect(m.grainAmount(0)).toBe(0);
    expect(m.grainAmount(50)).toBeCloseTo(0.01, 9);
    expect(m.grainAmount(100)).toBeCloseTo(0.02, 9);
    expect(m.grainAmount(400)).toBeCloseTo(0.02, 9);
    for (let e = 0; e < 50; e++) {
      const none = m.filmWear(e, 0, rng);
      expect(none.scratches).toEqual([]);
      expect(none.specks).toEqual([]);
      expect(none.flicker).toBe(1);
      const lots = m.filmWear(e, 100, rng);
      expect(lots.scratches.length).toBeLessThanOrEqual(4);
      expect(lots.specks.length).toBeLessThanOrEqual(12);
      // the projector's lamp flickers a little, at most 1.5 % either way
      expect(Math.abs(lots.flicker - 1)).toBeLessThanOrEqual(0.015);
      for (const s of lots.scratches) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1920);
        expect(s.y1).toBeGreaterThan(s.y0);
        expect(s.width).toBeGreaterThan(0);
        expect(s.width).toBeLessThanOrEqual(3);
      }
      for (const d of lots.specks) {
        expect(d.r).toBeGreaterThan(0);
        expect(d.r).toBeLessThanOrEqual(4);
      }
    }
    let some = 0;
    for (let e = 0; e < 50; e++) some += m.filmWear(e, 100, rng).scratches.length;
    expect(some).toBeGreaterThan(30);
  });

  it("the text fades in over the first two seconds", () => {
    expect(m.textFade(0)).toBe(0);
    expect(m.textFade(0.3)).toBe(0);
    expect(m.textFade(1)).toBeGreaterThan(0.3);
    expect(m.textFade(1.9)).toBe(1);
    expect(m.textFade(100)).toBe(1);
  });
});

describe("Red Letter motion: the title's layout", () => {
  // a condensed face: capitals 50 px wide at 100 px, a space 25 px
  const charWidth = (ch: string) => (ch === " " ? 25 : 50);
  const CAP = 72;

  it("a short title sits on one line across the centre, at most 110 px", () => {
    const l = m.placeTitle("SONG NAME", charWidth, CAP);
    expect(l.lines).toEqual(["SONG NAME"]);
    expect(l.size).toBe(m.TITLE_MAX);
    expect(l.chars.map((c) => c.ch).join("")).toBe("SONG NAME");
    expect((l.left + l.right) / 2).toBeCloseTo(960, 6);
    expect((l.top + l.bottom) / 2).toBeCloseTo(m.CENTRE_Y, 6);
    // wide spacing: the gap between letters is at least a third of the size
    const [s, o] = l.chars;
    expect(o.x - (s.x + s.w)).toBeGreaterThanOrEqual(l.size / 3);
    // letters know their red-letter slot; spaces have none
    expect(l.chars.map((c) => c.slot)).toEqual([0, 1, 2, 3, -1, 4, 5, 6, 7]);
  });

  it("a 60-character title wraps onto two lines or shrinks, and never leaves the safe width", () => {
    const titles = [
      "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG AND KEEPS RUNNIN",
      "A".repeat(60),
      "SUPERCALIFRAGILISTICEXPIALIDOCIOUS IS A VERY LONG WORD INDEE",
    ];
    for (const title of titles) {
      expect(title.length).toBe(60);
      const l = m.placeTitle(title, charWidth, CAP);
      expect(l.lines.length).toBeLessThanOrEqual(2);
      expect(l.right - l.left).toBeLessThanOrEqual(m.TITLE_SAFE + 0.01);
      expect(l.left).toBeGreaterThanOrEqual((1920 - m.TITLE_SAFE) / 2 - 0.01);
      expect(l.size).toBeGreaterThan(10);
      for (const c of l.chars) {
        expect(c.x).toBeGreaterThanOrEqual(l.left - 0.01);
        expect(c.x + c.w).toBeLessThanOrEqual(l.right + 0.01);
      }
      expect(l.lines.join(" ")).toBe(title);
    }
    // the sentence wraps (two lines are bigger than one tiny line)
    expect(m.placeTitle(titles[0], charWidth, CAP).lines.length).toBe(2);
    // one long word can't wrap: it shrinks instead
    expect(m.placeTitle(titles[1], charWidth, CAP).lines.length).toBe(1);
  });

  it("an empty title has no letters and leaves a small gap in the centre", () => {
    const l = m.placeTitle("", charWidth, CAP);
    expect(l.chars).toEqual([]);
    expect(l.right - l.left).toBeGreaterThan(0);
    expect((l.left + l.right) / 2).toBeCloseTo(960, 6);
  });

  it("the artist line is small, at most a quarter of the title, and fits the safe width", () => {
    expect(m.artistSize(110, 800)).toBeLessThanOrEqual(110 / 4 + 1e-9);
    expect(m.artistSize(110, 800)).toBeGreaterThanOrEqual(14);
    expect(m.artistSize(20, 800)).toBe(14);
    // a very long artist name shrinks to fit
    const size = m.artistSize(110, 20000);
    expect((size * 20000) / 100).toBeLessThanOrEqual(m.TITLE_SAFE + 0.01);
  });
});
