// Hyper Tunnel's motion maths (templates/hyper-tunnel/assets/tunnel-motion.js): the tunnel's
// travel and its frames, the spectrum running down the tunnel, the edges' beat flash, the visor,
// the robot's head nod, turn and arm sway, the accent flares on strong beats, the HUD's crawl
// and the title's fit. All worked out from the song time and the audio alone, so any frame can be
// drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Rand = VizToolkit["mulberry32"];
type HitEvent = { age: number; strength: number; frame: number };
type Flare = {
  frame: number;
  age: number;
  side: number;
  angle: number;
  progress: number;
  bright: number;
};
type Frame = { index: number; depth: number };
type Trace = { face: number; w0: number; w1: number; a: number; b: number };
type Gap = { traces: Trace[]; corners: boolean[]; cable: { sag: number; at: number } | null };
type Motion = {
  SEED: number;
  TUNNEL_BASE: number;
  TUNNEL_LOUD: number;
  FRAME_SPACING: number;
  FRAME_COUNT: number;
  HALF_SIDE: number;
  NOD_MAX: number;
  NOD_RELEASE: number;
  TURN_MAX: number;
  TURN_BASE: number;
  SWAY_MAX: number;
  SWAY_RATE: number;
  FLARE: number;
  FLARE_LIFE: number;
  EDGE_RELEASE: number;
  CRAWL_RATE: number;
  tunnelSpeed: (loud: number, intensity: number) => number;
  loudTable: (frames: ToolkitAnalysis["frames"], fps: number) => Float64Array;
  loudSeconds: (
    table: Float64Array,
    fps: number,
    offset: number,
    t: number,
    before: number,
  ) => number;
  tunnelTravel: (songTime: number, loudSeconds: number, intensity: number) => number;
  tunnelFrames: (travel: number) => Frame[];
  frameFade: (depth: number) => number;
  bandPosition: (depth: number, count: number) => number;
  frameLevels: (
    spectrum: ArrayLike<number>,
    frames: Frame[],
    intensity: number,
    boost: number,
  ) => Float32Array;
  edgeLevel: (level: number, env: number, intensity: number) => number;
  visorLevel: (loud: number, env: number, intensity: number) => { core: number; glow: number };
  headNod: (env: number, intensity: number) => number;
  headTurn: (songTime: number, mulberry32: Rand) => number;
  armSway: (songTime: number, mulberry32: Rand) => [number, number];
  hitEvents: (audio: ToolkitAudio, t: number) => HitEvent[];
  flare: (events: HitEvent[], intensity: number, mulberry32: Rand) => Flare | null;
  gapLayout: (index: number, mulberry32: Rand) => Gap;
  meterHeights: (
    values: ArrayLike<number>,
    intensity: number,
    boost: number,
    maxPx: number,
  ) => Float32Array;
  hudCrawl: (songTime: number, period: number) => number;
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/hyper-tunnel/assets/tunnel-motion.js") as Motion;
const rand = viz.mulberry32;
const DEG = Math.PI / 180;

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

describe("Hyper Tunnel motion: the tunnel", () => {
  it("rushes at 1 + 0.7 × loud × intensity", () => {
    expect(m.TUNNEL_LOUD).toBeCloseTo(0.7, 9);
    expect(m.tunnelSpeed(0, 1)).toBe(1);
    expect(m.tunnelSpeed(1, 1)).toBeCloseTo(1.7, 9);
    expect(m.tunnelSpeed(0.5, 2)).toBeCloseTo(1.7, 9);
    expect(m.tunnelSpeed(1, 0.2)).toBeCloseTo(1.14, 9);
    expect(m.tunnelSpeed(NaN, NaN)).toBe(1);
    expect(m.tunnelSpeed(5, 9)).toBeCloseTo(2.4, 9); // loud at most 1, intensity at most 2
  });

  it("travels forward at that speed, from the loudness so far", () => {
    const table = m.loudTable(full.frames, FPS);
    const audio = viz.createAudio(full);
    let last = -Infinity;
    for (let t = 0; t < 14; t += 0.05) {
      const travel = m.tunnelTravel(t, m.loudSeconds(table, FPS, 0, t, 0), 1);
      expect(Number.isFinite(travel)).toBe(true);
      expect(travel).toBeGreaterThanOrEqual(last);
      last = travel;
    }
    for (const t of [0.5, 3.2, 7.7, 12]) {
      const dt = 0.01;
      const a = m.tunnelTravel(t, m.loudSeconds(table, FPS, 0, t, 0), 1);
      const b = m.tunnelTravel(t + dt, m.loudSeconds(table, FPS, 0, t + dt, 0), 1);
      expect((b - a) / dt / m.TUNNEL_BASE).toBeCloseTo(m.tunnelSpeed(audio.sample(t).loud, 1), 1);
    }
    // silence: the base speed alone
    expect(m.tunnelTravel(10, 0, 1)).toBeCloseTo(10 * m.TUNNEL_BASE, 9);
    expect(m.tunnelTravel(NaN, NaN, NaN)).toBe(0);
  });

  it("a section's tunnel is exactly where the full render's is at the same song time", () => {
    const whole = m.loudTable(full.frames, FPS);
    for (const start of [2.5, 5, 9.4]) {
      const cut = sliceAnalysis(full, start, 14);
      const part = m.loudTable(cut.frames, FPS);
      for (const t of [0, 0.5, 2, 4]) {
        const a = m.tunnelTravel(
          start + t,
          m.loudSeconds(part, FPS, cut.offset, t, cut.loudBefore ?? 0),
          1,
        );
        const b = m.tunnelTravel(start + t, m.loudSeconds(whole, FPS, 0, start + t, 0), 1);
        expect(a).toBeCloseTo(b, 4);
        expect(m.tunnelFrames(a).map((f) => f.index)).toEqual(
          m.tunnelFrames(b).map((f) => f.index),
        );
      }
    }
  });

  it("lays out the frames ahead, recycling toward the camera as it travels", () => {
    const D = m.FRAME_SPACING;
    const a = m.tunnelFrames(100);
    expect(a).toHaveLength(m.FRAME_COUNT);
    for (let i = 0; i < a.length; i++) {
      expect(Number.isInteger(a[i].index)).toBe(true);
      expect(a[i].depth).toBeGreaterThan(0);
      expect(a[i].depth).toBeLessThanOrEqual(D * m.FRAME_COUNT + 1e-9);
      if (i > 0) {
        expect(a[i].index).toBe(a[i - 1].index + 1);
        expect(a[i].depth - a[i - 1].depth).toBeCloseTo(D, 9);
      }
    }
    // a little later every frame is a little nearer; after a whole spacing the nearest has gone
    const b = m.tunnelFrames(100 + D * 0.25);
    expect(b[0].index).toBe(a[0].index);
    expect(b[0].depth).toBeCloseTo(a[0].depth - D * 0.25, 9);
    const c = m.tunnelFrames(100 + D);
    expect(c[0].index).toBe(a[0].index + 1);
    expect(m.tunnelFrames(NaN)[0].depth).toBeGreaterThan(0);
  });

  it("frames fade in far away and out as they pass the camera", () => {
    const far = m.FRAME_SPACING * m.FRAME_COUNT;
    expect(m.frameFade(far)).toBeLessThan(0.05);
    expect(m.frameFade(far * 0.4)).toBeGreaterThan(0.9);
    expect(m.frameFade(0.05)).toBeLessThan(0.1);
    for (let d = 0; d <= far; d += 0.5) {
      const f = m.frameFade(d);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(m.frameFade(NaN)).toBe(0);
  });
});

describe("Hyper Tunnel motion: the spectrum down the tunnel", () => {
  it("nearer frames follow lower bands", () => {
    const n = 8;
    const far = m.FRAME_SPACING * m.FRAME_COUNT;
    let last = -1;
    for (let d = 0; d <= far; d += 1) {
      const p = m.bandPosition(d, n);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(n - 1);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(m.bandPosition(m.FRAME_SPACING, n)).toBeLessThan(1);
    expect(m.bandPosition(far, n)).toBeCloseTo(n - 1, 6);
    expect(m.bandPosition(NaN, n)).toBe(0);
  });

  it("each frame's level is its band, shaped: loud bass lights the near frames", () => {
    const frs = m.tunnelFrames(50);
    const bass = [1, 0.9, 0.5, 0.3, 0.2, 0.1, 0.05, 0.02];
    const lv = m.frameLevels(bass, frs, 1, 4);
    expect(lv).toHaveLength(frs.length);
    for (const x of lv) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(lv[0]).toBeGreaterThan(0.7);
    expect(lv[lv.length - 1]).toBeLessThan(0.05);
    // the treble lights the far ones instead
    const treble = [...bass].reverse();
    const lt = m.frameLevels(treble, frs, 1, 4);
    expect(lt[lt.length - 1]).toBeGreaterThan(lt[0]);
    // saturated bands still give shape (relative to the loudest, squared)
    const sat = m.frameLevels([1, 1, 0.9, 0.85, 0.8, 0.8, 0.75, 0.7], frs, 1, 4);
    expect(sat[sat.length - 1]).toBeLessThan(sat[0] * 0.75);
    // silence: dark, no NaN
    for (const x of m.frameLevels(new Float32Array(8), frs, 1, 4)) expect(x).toBe(0);
    for (const x of m.frameLevels([NaN, NaN], frs, NaN, NaN)) expect(x).toBe(0);
    // a bigger boost lifts a quiet song
    const quiet = bass.map((x) => x * 0.3);
    expect(m.frameLevels(quiet, frs, 1, 8)[0]).toBeGreaterThan(m.frameLevels(quiet, frs, 1, 1)[0]);
  });

  it("the edges glow in silence and flash on the beat", () => {
    const calm = m.edgeLevel(0, 0, 1);
    expect(calm).toBeGreaterThan(0.15);
    expect(m.edgeLevel(1, 0, 1)).toBeGreaterThan(calm * 2);
    expect(m.edgeLevel(0.5, 1, 1)).toBeGreaterThan(m.edgeLevel(0.5, 0, 1));
    expect(m.edgeLevel(1, 1, 2)).toBeLessThanOrEqual(2);
    expect(m.edgeLevel(NaN, NaN, NaN)).toBeCloseTo(calm, 9);
    expect(m.EDGE_RELEASE).toBeGreaterThan(0);
    expect(m.EDGE_RELEASE).toBeLessThanOrEqual(0.4);
  });

  it("the visor glows, brighter with the music, and flares on the beat", () => {
    const calm = m.visorLevel(0, 0, 1);
    expect(calm.core).toBeGreaterThan(0.3);
    expect(m.visorLevel(1, 0, 1).core).toBeGreaterThan(calm.core);
    const flared = m.visorLevel(0.5, 1, 1);
    expect(flared.glow).toBeGreaterThan(m.visorLevel(0.5, 0, 1).glow * 1.5);
    expect(flared.core).toBeLessThanOrEqual(1.6);
    const bad = m.visorLevel(NaN, NaN, NaN);
    expect(Number.isFinite(bad.core) && Number.isFinite(bad.glow)).toBe(true);
  });
});

describe("Hyper Tunnel motion: the robot", () => {
  it("nods at most 3° on the beat, released over 0.3 s", () => {
    expect(m.NOD_MAX).toBeCloseTo(3 * DEG, 9);
    expect(m.NOD_RELEASE).toBeCloseTo(0.3, 9);
    expect(m.headNod(0, 1)).toBe(0);
    expect(m.headNod(1, 1)).toBeCloseTo(3 * DEG, 9);
    expect(m.headNod(1, 2)).toBeLessThanOrEqual(3 * DEG + 1e-12);
    expect(m.headNod(0.5, 1)).toBeLessThan(m.headNod(1, 1));
    expect(m.headNod(NaN, NaN)).toBe(0);
    // with the toolkit's envelope at that release: right after a beat, then fading
    const audio = viz.createAudio(full);
    const at = (t: number) => m.headNod(viz.beatEnvelope(audio, t, m.NOD_RELEASE), 1);
    expect(at(1.0)).toBeGreaterThan(at(1.15));
    expect(at(1.15)).toBeGreaterThan(0);
    expect(m.headNod(viz.beatEnvelope(viz.createAudio(silent), 5, m.NOD_RELEASE), 1)).toBe(0);
  });

  it("turns its head slowly, at most 8° either way about its pose, from the song time", () => {
    expect(m.TURN_MAX).toBeCloseTo(8 * DEG, 9);
    let lo = Infinity,
      hi = -Infinity;
    for (let s = 0; s < 600; s += 0.1) {
      const a = m.headTurn(s, rand) - m.TURN_BASE;
      expect(Math.abs(a)).toBeLessThanOrEqual(m.TURN_MAX + 1e-9);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(hi - lo).toBeGreaterThan(8 * DEG); // it really does turn
    // the same song time, the same turn; it moves only a few times a second, by small steps
    expect(m.headTurn(123.4, rand)).toBe(m.headTurn(123.4, rand));
    expect(m.headTurn(10, rand)).toBe(m.headTurn(10 + 0.5 / m.SWAY_RATE, rand));
    expect(m.SWAY_RATE).toBeLessThanOrEqual(6);
    for (let s = 0; s < 120; s += 1 / m.SWAY_RATE) {
      expect(Math.abs(m.headTurn(s + 1 / m.SWAY_RATE, rand) - m.headTurn(s, rand))).toBeLessThan(
        0.25 * DEG,
      );
    }
    expect(Number.isFinite(m.headTurn(NaN, rand))).toBe(true);
  });

  it("sways its arms slightly with the song time", () => {
    for (let s = 0; s < 300; s += 0.37) {
      const [l, r] = m.armSway(s, rand);
      expect(Math.abs(l)).toBeLessThanOrEqual(m.SWAY_MAX + 1e-9);
      expect(Math.abs(r)).toBeLessThanOrEqual(m.SWAY_MAX + 1e-9);
    }
    expect(m.SWAY_MAX).toBeLessThanOrEqual(4 * DEG);
    expect(m.armSway(42, rand)).toEqual(m.armSway(42, rand));
    expect(m.armSway(42, rand)).not.toEqual(m.armSway(52, rand));
    expect(m.armSway(NaN, rand).every(Number.isFinite)).toBe(true);
  });
});

describe("Hyper Tunnel motion: the flares", () => {
  it("lists the strong beats with their song frame, the same in a section", () => {
    const whole = viz.createAudio(full);
    const ev = m.hitEvents(whole, 5.1);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.strength).toBeGreaterThanOrEqual(m.FLARE);
      expect(e.age).toBeGreaterThanOrEqual(0);
      expect(e.age).toBeLessThanOrEqual(m.FLARE_LIFE);
      expect(Number.isInteger(e.frame)).toBe(true);
    }
    expect(ev[0].frame).toBe(150); // the strong hit at 5 s
    const cut = viz.createAudio(sliceAnalysis(full, 4, 14));
    expect(m.hitEvents(cut, 1.1)).toEqual(ev.map((e) => ({ ...e, age: expect.closeTo(e.age, 6) })));
    expect(m.hitEvents(viz.createAudio(silent), 5)).toEqual([]);
  });

  it("a strong beat sweeps an accent flare across, seeded by its song frame", () => {
    const at = (age: number, frame = 300) => [{ age, strength: 1, frame }];
    const now = m.flare(at(0.02), 1, rand)!;
    expect(now).not.toBeNull();
    expect(now.frame).toBe(300);
    expect([-1, 1]).toContain(now.side);
    expect(Math.abs(now.angle)).toBeLessThanOrEqual(40 * DEG);
    expect(now.bright).toBeGreaterThan(0.6);
    expect(now.bright).toBeLessThanOrEqual(1);
    // the same flare all through its life, sweeping on and fading …
    const later = m.flare(at(0.3), 1, rand)!;
    expect(later.side).toBe(now.side);
    expect(later.angle).toBe(now.angle);
    expect(later.progress).toBeGreaterThan(now.progress);
    expect(later.bright).toBeLessThan(now.bright);
    // … over 0.5 s, then gone
    expect(m.FLARE_LIFE).toBeCloseTo(0.5, 9);
    expect(m.flare(at(0.49), 1, rand)!.bright).toBeLessThan(0.05);
    expect(m.flare(at(0.5), 1, rand)).toBeNull();
    expect(m.flare([], 1, rand)).toBeNull();
    // other beats come from either side at other angles
    const sides = new Set<number>(),
      angles = new Set<number>();
    for (let f = 0; f < 60; f++) {
      const x = m.flare(at(0.1, f), 1, rand)!;
      sides.add(x.side);
      angles.add(Math.round(x.angle / DEG));
    }
    expect(sides.size).toBe(2);
    expect(angles.size).toBeGreaterThan(8);
    // intensity scales it; nonsense gives none
    expect(m.flare(at(0.02), 0.2, rand)!.bright).toBeLessThan(now.bright);
    expect(m.flare([{ age: NaN, strength: NaN, frame: 1 }], NaN, rand)).toBeNull();
  });

  it("a section shows the same flare as the full render at the same song time", () => {
    const whole = viz.createAudio(full);
    const cut = viz.createAudio(sliceAnalysis(full, 4, 14));
    for (const t of [1.05, 1.2, 1.4, 2.6, 3.05]) {
      const a = m.flare(m.hitEvents(cut, t), 1, rand);
      const b = m.flare(m.hitEvents(whole, 4 + t), 1, rand);
      if (b === null) expect(a).toBeNull();
      else {
        expect(a).not.toBeNull();
        expect(a!.frame).toBe(b.frame);
        expect(a!.side).toBe(b.side);
        expect(a!.angle).toBe(b.angle);
        expect(a!.bright).toBeCloseTo(b.bright, 5);
      }
    }
  });
});

describe("Hyper Tunnel motion: the tunnel's details", () => {
  it("each gap between frames has its own circuit traces, corner lines and maybe a cable", () => {
    const g = m.gapLayout(17, rand);
    expect(m.gapLayout(17, rand)).toEqual(g);
    expect(m.gapLayout(18, rand)).not.toEqual(g);
    expect(g.corners).toHaveLength(8);
    let traces = 0,
      cables = 0;
    for (let i = 0; i < 200; i++) {
      const x = m.gapLayout(i, rand);
      traces += x.traces.length;
      if (x.cable) {
        cables++;
        expect(x.cable.sag).toBeGreaterThan(0);
        expect(x.cable.at).toBeGreaterThan(0);
        expect(x.cable.at).toBeLessThan(1);
      }
      for (const t of x.traces) {
        expect(Number.isInteger(t.face) && t.face >= 0 && t.face < 8).toBe(true);
        for (const w of [t.w0, t.w1]) expect(Math.abs(w)).toBeLessThan(m.HALF_SIDE);
        expect(t.a).toBeGreaterThanOrEqual(0);
        expect(t.b).toBeGreaterThanOrEqual(t.a);
        expect(t.b).toBeLessThanOrEqual(1);
      }
    }
    expect(traces / 200).toBeGreaterThan(4); // many thin lines
    expect(cables).toBeGreaterThan(10); // a few cables, not every gap
    expect(cables).toBeLessThan(100);
  });

  it("the HUD meters are shaped bar heights, none in silence", () => {
    const h = m.meterHeights([1, 0.9, 0.5, 0.2], 1, 4, 24);
    expect(h[0]).toBeCloseTo(24, 6);
    expect(h[3]).toBeLessThan(h[0] * 0.2);
    for (const x of m.meterHeights([0, 0, 0], 1, 4, 24)) expect(x).toBe(0);
    for (const x of m.meterHeights([NaN, 1], NaN, NaN, 24)) expect(Number.isFinite(x)).toBe(true);
  });

  it("the HUD ticks crawl slowly, in whole pixels, a few times a second", () => {
    const seen = new Set<number>();
    for (let s = 0; s < 10; s += 1 / 30) {
      const c = m.hudCrawl(s, 24);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(24);
      seen.add(Math.floor(s * 30));
    }
    // changes at most CRAWL_RATE times a second
    expect(m.CRAWL_RATE).toBeLessThanOrEqual(6);
    let changes = 0;
    for (let f = 1; f < 300; f++)
      if (m.hudCrawl(f / 30, 24) !== m.hudCrawl((f - 1) / 30, 24)) changes++;
    expect(changes).toBeLessThanOrEqual(10 * m.CRAWL_RATE + 1);
    expect(changes).toBeGreaterThan(0);
    expect(m.hudCrawl(NaN, 24)).toBe(0);
  });

  it("fits a 60-character title by shrinking, then wrapping", () => {
    const measure = (s: string) => s.length * 0.7;
    const short = m.fitTitle("T-REX", measure, 760, 2, 64, 26);
    expect(short).toEqual({ size: 64, lines: ["T-REX"] });
    const long = m.fitTitle(
      "A".repeat(20) + " " + "B".repeat(19) + " " + "C".repeat(19),
      measure,
      760,
      2,
      64,
      26,
    );
    expect(long.lines.length).toBeLessThanOrEqual(2);
    for (const l of long.lines) expect(measure(l) * long.size).toBeLessThanOrEqual(760);
    const word = m.fitTitle("W".repeat(60), measure, 760, 2, 64, 26);
    for (const l of word.lines) expect(measure(l) * word.size).toBeLessThanOrEqual(760);
    expect(m.fitTitle("", measure, 760, 2, 64, 26).lines).toEqual([]);
  });
});

describe("Hyper Tunnel motion: silence", () => {
  it("draws a calm frame: base speed, dim frames, no nod, no flare, no NaN", () => {
    const audio = viz.createAudio(silent);
    const table = m.loudTable(silent.frames, FPS);
    for (const t of [0, 2, 7.5]) {
      const travel = m.tunnelTravel(t, m.loudSeconds(table, FPS, 0, t, 0), 1);
      expect(travel).toBeCloseTo(t * m.TUNNEL_BASE, 9);
      const frs = m.tunnelFrames(travel);
      const lv = m.frameLevels(audio.spectrum(t), frs, 1, 4);
      for (const x of lv) expect(x).toBe(0);
      expect(m.headNod(viz.beatEnvelope(audio, t, m.NOD_RELEASE), 1)).toBe(0);
      expect(m.flare(m.hitEvents(audio, t), 1, rand)).toBeNull();
      expect(Number.isFinite(m.edgeLevel(0, 0, 1))).toBe(true);
    }
  });
});
