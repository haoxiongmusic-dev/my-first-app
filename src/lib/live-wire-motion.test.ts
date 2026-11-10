// Live Wire's motion maths (templates/live-wire/assets/wire-motion.js): the cone's pump, the
// cables' paths, the arcs crawling along them and crackling round the rim (re-seeded 12 times a
// second from the song time), the bright arc and the debris on strong hits, the shake, the wall's
// light and the title's fit. All worked out from the song time and the audio alone, so any frame
// can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;
const sp = require("../../templates/live-wire/assets/speaker-voxels.js") as {
  PLUG_ANGLES: number[];
  PLUG_REACH: number;
  R_OUT: number;
};

type Pt = [number, number];
type Arc = { s0: number; s1: number; mid: number; seed: number; bright: number };
type RingArc = { a0: number; a1: number; seed: number; bright: number };
type HitEvent = { age: number; strength: number; frame: number };
type Speck = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  size: number;
  alpha: number;
  kind: "streak" | "chip";
  spin: number;
};
type Motion = {
  SEED: number;
  TICK_RATE: number;
  CENTRE: { x: number; y: number };
  VOXEL_PX: number;
  CONE_PUMP: number;
  CONE_MAX: number;
  STRONG: number;
  DEBRIS_MAX: number;
  DEBRIS_LIFE: number;
  SHAKE_MAX: number;
  HIT_ARC_LIFE: number;
  MAX_ARCS: number;
  tickOf: (songTime: number) => number;
  tickTime: (tick: number) => number;
  bassLevel: (bands: ArrayLike<number>) => number;
  coneScale: (bass: number, env: number, intensity: number) => number;
  conePush: (scale: number) => number;
  TILT_X: number;
  speakerTilt: (songTime: number, mulberry32: VizToolkit["mulberry32"]) => [number, number];
  arcLevel: (loud: number, intensity: number) => number;
  cablePath: (cable: number, count: number) => Pt[];
  boltAlong: (
    points: Pt[],
    s0: number,
    s1: number,
    seed: number,
    lightningPath: VizToolkit["lightningPath"],
  ) => Pt[];
  cableArcs: (
    cable: number,
    tick: number,
    level: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => Arc[];
  ringArcs: (tick: number, level: number, mulberry32: VizToolkit["mulberry32"]) => RingArc[];
  sparkLengths: (
    values: ArrayLike<number>,
    intensity: number,
    boost: number,
    maxLen: number,
  ) => Float32Array;
  hitEvents: (audio: ToolkitAudio, t: number) => HitEvent[];
  hitArc: (
    events: HitEvent[],
    tick: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => { cable: number; s: number; turn: number; seed: number; bright: number } | null;
  strikeEnds: (points: Pt[], strike: { s: number; turn: number }) => { from: Pt; to: Pt };
  RIM_PX: number;
  debris: (
    events: HitEvent[],
    intensity: number,
    on: boolean,
    mulberry32: VizToolkit["mulberry32"],
  ) => Speck[];
  hitEnvelope: (events: HitEvent[]) => number;
  shakeOffset: (
    env: number,
    intensity: number,
    songTime: number,
    on: boolean,
    mulberry32: VizToolkit["mulberry32"],
  ) => [number, number];
  wallLight: (level: number, env: number) => { light: number; glow: number };
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/live-wire/assets/wire-motion.js") as Motion;
const rand = viz.mulberry32;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/** 14 s: silent for 1 s, then music with hits every half second (every other one strong). */
function frames(): Frame[] {
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

describe("Live Wire motion: the cone", () => {
  it("pumps 1 + 0.08 × bass × intensity plus a kick, never past its cap", () => {
    expect(m.CONE_PUMP).toBe(0.08);
    expect(m.coneScale(0, 0, 1)).toBe(1);
    expect(m.coneScale(1, 0, 1)).toBeCloseTo(1.08, 9);
    expect(m.coneScale(0.5, 0, 1)).toBeCloseTo(1.04, 9);
    expect(m.coneScale(1, 1, 1)).toBeGreaterThan(m.coneScale(1, 0, 1));
    for (const b of [0, 0.5, 1, 7])
      for (const e of [0, 1, 4])
        for (const i of [0.2, 1, 2, 9]) {
          const s = m.coneScale(b, e, i);
          expect(s).toBeGreaterThanOrEqual(1);
          expect(s).toBeLessThanOrEqual(m.CONE_MAX);
        }
    expect(m.CONE_MAX).toBeLessThanOrEqual(1.2);
    expect(m.coneScale(NaN, NaN, NaN)).toBe(1);
    // it comes forward a little as it grows, staying under the rim
    expect(m.conePush(1)).toBe(0);
    expect(m.conePush(m.CONE_MAX)).toBeGreaterThan(0);
    expect(m.conePush(m.CONE_MAX)).toBeLessThanOrEqual(1.5);
  });

  it("the speaker leans back a little and sways slowly and gently", () => {
    let prev = m.speakerTilt(0, rand);
    let swayed = 0;
    for (let s = 0; s < 300; s += 1 / 30) {
      const [x, y] = m.speakerTilt(s, rand);
      expect(Math.abs(x - m.TILT_X)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.08);
      expect(m.TILT_X).toBeLessThan(0); // its top leans away: seen a little from above
      expect(Math.abs(m.TILT_X)).toBeLessThan(0.2);
      // slow: under 0.002 rad a frame
      expect(Math.abs(x - prev[0]) + Math.abs(y - prev[1])).toBeLessThan(0.002);
      swayed = Math.max(swayed, Math.abs(y));
      prev = [x, y];
    }
    expect(swayed).toBeGreaterThan(0.04);
    expect(m.speakerTilt(77.7, rand)).toEqual(m.speakerTilt(77.7, rand));
    expect(m.speakerTilt(NaN, rand).every(Number.isFinite)).toBe(true);
  });

  it("the bass level is shaped, 0 in silence, finite", () => {
    expect(m.bassLevel(new Float32Array(32))).toBe(0);
    const loud = m.bassLevel(new Float32Array(32).fill(0.9));
    const mid = m.bassLevel(new Float32Array(32).fill(0.5));
    expect(loud).toBeGreaterThan(mid);
    expect(loud).toBeLessThanOrEqual(1);
    expect(mid).toBeLessThan(0.5); // shaped: middling bass moves the cone less
    expect(m.bassLevel([NaN, NaN])).toBe(0);
  });
});

describe("Live Wire motion: the cables", () => {
  it("four S-shaped cables run from the plugs out past the frame's four corners", () => {
    const corners: Pt[] = [
      [1920, 0],
      [0, 0],
      [0, 1080],
      [1920, 1080],
    ];
    for (let c = 0; c < 4; c++) {
      const pts = m.cablePath(c, 64);
      expect(pts).toHaveLength(64);
      for (const p of pts) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
      // it starts at its plug's tip (the plugs' angles are anticlockwise, y up)
      const a = (sp.PLUG_ANGLES[c] * Math.PI) / 180;
      const tip = sp.PLUG_REACH * m.VOXEL_PX;
      expect(pts[0][0]).toBeCloseTo(m.CENTRE.x + Math.cos(a) * tip, 0);
      expect(pts[0][1]).toBeCloseTo(m.CENTRE.y - Math.sin(a) * tip, 0);
      // it ends beyond its corner, outside the frame
      const end = pts[pts.length - 1];
      const corner = corners[c];
      expect(end[0] < 0 || end[0] > 1920 || end[1] < 0 || end[1] > 1080).toBe(true);
      expect(Math.hypot(end[0] - corner[0], end[1] - corner[1])).toBeLessThan(160);
      // an S: it bends one way, then the other
      const turns: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const ax = pts[i][0] - pts[i - 1][0],
          ay = pts[i][1] - pts[i - 1][1];
        const bx = pts[i + 1][0] - pts[i][0],
          by = pts[i + 1][1] - pts[i][1];
        turns.push(ax * by - ay * bx);
      }
      expect(turns.some((x) => x > 1e-3)).toBe(true);
      expect(turns.some((x) => x < -1e-3)).toBe(true);
    }
    // mirrored left to right and top to bottom
    const a = m.cablePath(0, 16),
      b = m.cablePath(1, 16),
      d = m.cablePath(3, 16);
    for (let i = 0; i < 16; i++) {
      expect(b[i][0]).toBeCloseTo(1920 - a[i][0], 6);
      expect(b[i][1]).toBeCloseTo(a[i][1], 6);
      expect(d[i][1]).toBeCloseTo(1080 - a[i][1], 6);
    }
  });

  it("a bolt along a cable follows it from s0 to s1 with a jag", () => {
    const cable = m.cablePath(0, 96);
    const bolt = m.boltAlong(cable, 0.2, 0.45, 77, viz.lightningPath);
    expect(bolt.length).toBeGreaterThan(10);
    expect(m.boltAlong(cable, 0.2, 0.45, 77, viz.lightningPath)).toEqual(bolt);
    expect(m.boltAlong(cable, 0.2, 0.45, 78, viz.lightningPath)).not.toEqual(bolt);
    // every point stays near the cable
    for (const p of bolt) {
      let near = Infinity;
      for (const q of cable) near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
      expect(near).toBeLessThan(40);
    }
    // and it is jagged: not every point lies on the cable
    let off = 0;
    for (const p of bolt) {
      let near = Infinity;
      for (const q of m.cablePath(0, 2000))
        near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
      off = Math.max(off, near);
    }
    expect(off).toBeGreaterThan(3);
    expect(m.boltAlong(cable, 0.5, 0.5, 1, viz.lightningPath).length).toBeLessThanOrEqual(2);
  });
});

describe("Live Wire motion: the arcs", () => {
  it("re-seed 12 times a second, from the song time", () => {
    expect(m.TICK_RATE).toBe(12);
    expect(m.tickOf(0)).toBe(0);
    expect(m.tickOf(1)).toBe(12);
    expect(m.tickOf(1 / 12 - 1e-3)).toBe(0);
    expect(m.tickOf(10.5)).toBe(126);
    for (const s of [0.3, 7.77, 61.04]) {
      expect(m.tickTime(m.tickOf(s))).toBeLessThanOrEqual(s + 1e-9);
      expect(m.tickTime(m.tickOf(s))).toBeGreaterThan(s - 1 / 12);
    }
    // the same arcs all through one tick, new ones the next
    const a = m.cableArcs(0, 40, 0.8, rand);
    expect(m.cableArcs(0, 40, 0.8, rand)).toEqual(a);
    expect(m.cableArcs(0, 41, 0.8, rand)).not.toEqual(a);
    expect(m.ringArcs(40, 0.8, rand)).toEqual(m.ringArcs(40, 0.8, rand));
    expect(m.ringArcs(41, 0.8, rand)).not.toEqual(m.ringArcs(40, 0.8, rand));
    expect(m.tickOf(NaN)).toBe(0);
  });

  it("follow the loudness: more and brighter arcs when loud, none in silence", () => {
    let quietN = 0,
      loudN = 0,
      quietB = 0,
      loudB = 0;
    for (let tick = 0; tick < 200; tick++) {
      for (let c = 0; c < 4; c++) {
        const q = m.cableArcs(c, tick, 0.25, rand);
        const l = m.cableArcs(c, tick, 1, rand);
        quietN += q.length;
        loudN += l.length;
        quietB += q.reduce((s, a) => s + a.bright, 0);
        loudB += l.reduce((s, a) => s + a.bright, 0);
        for (const arc of [...q, ...l]) {
          expect(arc.s0).toBeGreaterThanOrEqual(0);
          expect(arc.s1).toBeLessThanOrEqual(1);
          expect(arc.s1).toBeGreaterThan(arc.s0);
          expect(arc.bright).toBeGreaterThan(0);
          expect(arc.bright).toBeLessThanOrEqual(1);
        }
        expect(l.length).toBeLessThanOrEqual(m.MAX_ARCS);
      }
    }
    expect(loudN).toBeGreaterThan(quietN * 1.5);
    expect(loudB / loudN).toBeGreaterThan(quietB / Math.max(1, quietN));
    expect(m.cableArcs(0, 5, 0, rand)).toEqual([]);
    expect(m.ringArcs(5, 0, rand)).toEqual([]);
    expect(m.ringArcs(5, 1, rand).length).toBeGreaterThan(0);
    expect(m.cableArcs(0, 5, NaN, rand)).toEqual([]);
    // the arc level: shaped loudness, 0 in silence
    expect(m.arcLevel(0, 1)).toBe(0);
    expect(m.arcLevel(0.9, 1)).toBeGreaterThan(m.arcLevel(0.4, 1));
    expect(m.arcLevel(5, 9)).toBeLessThanOrEqual(1);
    expect(m.arcLevel(NaN, NaN)).toBe(0);
  });

  it("crawl along their cable toward the speaker", () => {
    // follow one arc over a few ticks: its middle creeps toward s = 0
    const mids = [10, 11, 12].map((tick) => {
      const arcs = m.cableArcs(2, tick, 1, rand);
      return arcs.length ? arcs[0].mid : NaN;
    });
    // (a share of the cable, wrapping from the speaker back round to the corner)
    for (const [a, b] of [
      [mids[0], mids[1]],
      [mids[1], mids[2]],
    ]) {
      const step = (((a - b) % 1) + 1) % 1;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(0.05);
    }
  });

  it("sparks round the rim follow the spectrum, shaped into peaks, flat in silence", () => {
    const loud = Float32Array.from({ length: 36 }, (_, i) => 0.62 + 0.28 * Math.sin(i * 0.7));
    for (const intensity of [0.2, 1, 2])
      for (const boost of [1, 2, 4, 8])
        for (const x of m.sparkLengths(loud, intensity, boost, 70)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(70);
        }
    const h = Array.from(m.sparkLengths(loud, 1, 8, 70)).sort((a, b) => a - b);
    expect(h[h.length - 1]).toBeGreaterThan(40);
    expect(h[Math.floor(h.length / 2)]).toBeLessThan(h[h.length - 1] * 0.7);
    const quiet = Float32Array.from(loud, (x) => x * 0.3);
    expect(Math.max(...m.sparkLengths(quiet, 1, 8, 70))).toBeLessThan(
      Math.max(...m.sparkLengths(loud, 1, 8, 70)),
    );
    expect(Array.from(m.sparkLengths(new Float32Array(8), 1, 8, 70))).toEqual(new Array(8).fill(0));
  });
});

describe("Live Wire motion: strong hits", () => {
  it("lists the strong hits with their song frame, the same in a section", () => {
    const whole = viz.createAudio(full);
    const ev = m.hitEvents(whole, 5.1);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.strength).toBeGreaterThanOrEqual(m.STRONG);
      expect(e.age).toBeGreaterThanOrEqual(0);
      expect(e.age).toBeLessThanOrEqual(1);
      expect(Number.isInteger(e.frame)).toBe(true);
    }
    expect(ev[0].frame).toBe(150); // the hit at 5 s
    const cut = viz.createAudio(sliceAnalysis(full, 4, 14));
    expect(m.hitEvents(cut, 1.1)).toEqual(ev.map((e) => ({ ...e, age: expect.closeTo(e.age, 6) })));
    expect(m.hitEvents(viz.createAudio(silent), 5)).toEqual([]);
  });

  it("a bright arc jumps to the rim for a moment after a strong hit", () => {
    const at = (age: number) => [{ age, strength: 1, frame: 300 }];
    const now = m.hitArc(at(0.02), 120, rand);
    expect(now).not.toBeNull();
    expect(now!.cable).toBeGreaterThanOrEqual(0);
    expect(now!.cable).toBeLessThan(4);
    expect(now!.s).toBeGreaterThan(0);
    expect(now!.s).toBeLessThan(1);
    expect(now!.bright).toBeGreaterThan(0.8);
    const later = m.hitArc(at(0.2), 122, rand);
    expect(later!.cable).toBe(now!.cable); // the same strike …
    expect(later!.seed).not.toBe(now!.seed); // … re-jagged with the arcs
    expect(later!.bright).toBeLessThan(now!.bright);
    expect(m.hitArc(at(m.HIT_ARC_LIFE + 0.01), 130, rand)).toBeNull();
    // it leaps from the cable across open wall to the rim
    for (let c = 0; c < 4; c++) {
      const pts = m.cablePath(c, 96);
      const ends = m.strikeEnds(pts, { s: now!.s, turn: now!.turn });
      const onCable = Math.min(
        ...pts.map((q) => Math.hypot(q[0] - ends.from[0], q[1] - ends.from[1])),
      );
      expect(onCable).toBeLessThan(15);
      const rim = Math.hypot(ends.to[0] - m.CENTRE.x, ends.to[1] - m.CENTRE.y);
      expect(rim).toBeCloseTo(m.RIM_PX - 2, 6);
      const a0 = Math.atan2(ends.from[1] - m.CENTRE.y, ends.from[0] - m.CENTRE.x);
      const a1 = Math.atan2(ends.to[1] - m.CENTRE.y, ends.to[0] - m.CENTRE.x);
      expect(Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)))).toBeGreaterThan(0.25);
      // toward the middle line on its own side (above for the upper cables)
      expect(Math.sign(ends.to[1] - m.CENTRE.y)).toBe(c < 2 ? -1 : 1);
    }
    expect(m.hitArc([], 130, rand)).toBeNull();
  });

  it("debris: seeded by the hit, at most 40 specks, gone after 0.8 s, off when disabled", () => {
    expect(m.DEBRIS_MAX).toBe(40);
    expect(m.DEBRIS_LIFE).toBeCloseTo(0.8, 9);
    const one = [{ age: 0.1, strength: 1, frame: 300 }];
    const a = m.debris(one, 1, true, rand);
    expect(a.length).toBeGreaterThan(4);
    expect(m.debris(one, 1, true, rand)).toEqual(a);
    expect(m.debris([{ ...one[0], frame: 301 }], 1, true, rand)).not.toEqual(a);
    const many = Array.from({ length: 12 }, (_, i) => ({
      age: i * 0.05,
      strength: 1,
      frame: 100 + i * 2,
    }));
    for (const intensity of [0.2, 1, 2])
      expect(m.debris(many, intensity, true, rand).length).toBeLessThanOrEqual(40);
    expect(m.debris(many, 2, true, rand).length).toBe(40);
    // flying outward and fading
    const early = m.debris([{ ...one[0], age: 0.05 }], 1, true, rand);
    const late = m.debris([{ ...one[0], age: 0.6 }], 1, true, rand);
    for (let i = 0; i < early.length; i++) {
      const r0 = Math.hypot(early[i].x - m.CENTRE.x, early[i].y - m.CENTRE.y);
      const r1 = Math.hypot(late[i].x - m.CENTRE.x, late[i].y - m.CENTRE.y);
      expect(r1).toBeGreaterThan(r0);
      expect(late[i].alpha).toBeLessThan(early[i].alpha);
      for (const v of [early[i], late[i]]) {
        expect(v.alpha).toBeGreaterThanOrEqual(0);
        expect(v.alpha).toBeLessThanOrEqual(1);
        for (const k of ["x", "y", "dx", "dy", "len", "size", "spin"] as const)
          expect(Number.isFinite(v[k])).toBe(true);
      }
    }
    expect(m.debris([{ ...one[0], age: 0.8 }], 1, true, rand)).toEqual([]);
    expect(m.debris(one, 1, false, rand)).toEqual([]);
    expect(m.debris([], 1, true, rand)).toEqual([]);
  });

  it("shakes faintly (whole pixels, at most 6) on strong hits, never when off", () => {
    expect(m.SHAKE_MAX).toBeLessThanOrEqual(6);
    expect(m.hitEnvelope([])).toBe(0);
    expect(m.hitEnvelope([{ age: 0, strength: 1, frame: 1 }])).toBeCloseTo(1, 6);
    expect(m.hitEnvelope([{ age: 0.3, strength: 1, frame: 1 }])).toBeLessThan(0.2);
    let biggest = 0;
    for (let s = 0; s < 30; s += 0.07) {
      for (const intensity of [0.2, 1, 2]) {
        const [dx, dy] = m.shakeOffset(1, intensity, s, true, rand);
        expect(Number.isInteger(dx) && Number.isInteger(dy)).toBe(true);
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(m.SHAKE_MAX + 1e-9);
        biggest = Math.max(biggest, Math.hypot(dx, dy));
      }
    }
    expect(biggest).toBeGreaterThan(2);
    expect(m.shakeOffset(1, 1, 3, false, rand)).toEqual([0, 0]);
    expect(m.shakeOffset(0, 1, 3, true, rand)).toEqual([0, 0]);
    expect(m.shakeOffset(NaN, NaN, NaN, true, rand)).toEqual([0, 0]);
    expect(m.shakeOffset(0.7, 1, 42.1, true, rand)).toEqual(
      m.shakeOffset(0.7, 1, 42.1, true, rand),
    );
  });
});

describe("Live Wire motion: a section matches the full song", () => {
  /** Everything the page draws from the time: the arcs' state, sparks, hits, debris, cone. */
  function state(audio: ToolkitAudio, t: number) {
    const songTime = t + audio.songStart;
    const tick = m.tickOf(songTime);
    const at = m.tickTime(tick) - audio.songStart;
    const a = audio.sample(at);
    const level = m.arcLevel(a.loud, 1);
    const ev = m.hitEvents(audio, t);
    return {
      tick,
      level,
      arcs: [0, 1, 2, 3].map((c) => m.cableArcs(c, tick, level, rand)),
      ring: m.ringArcs(tick, level, rand),
      hit: m.hitArc(ev, tick, rand),
      debris: m.debris(ev, 1, true, rand),
      cone: m.coneScale(m.bassLevel(audio.sample(t).bands), 0, 1),
    };
  }

  it("arcs, hits, debris and the cone are the same at the same song time", () => {
    const whole = viz.createAudio(full);
    for (const start of [2.5, 5, 7.25]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (const t of [0, 0.04, 0.5, 1.13, 2.6]) {
        const a = state(section, t);
        const b = state(whole, start + t);
        expect(a.tick).toBe(b.tick);
        expect(a.level).toBe(b.level); // (a level in 256 steps: exact)
        expect(a.arcs).toEqual(b.arcs);
        expect(a.ring).toEqual(b.ring);
        expect(a.hit?.seed).toBe(b.hit?.seed);
        expect(a.debris.length).toBe(b.debris.length);
        a.debris.forEach((d, i) => {
          expect(d.x).toBeCloseTo(b.debris[i].x, 2);
          expect(d.y).toBeCloseTo(b.debris[i].y, 2);
          expect(d.kind).toBe(b.debris[i].kind);
        });
        expect(a.cone).toBeCloseTo(b.cone, 5);
      }
    }
  });

  it("silence draws a calm frame: no arcs, no hits, the cone at rest, the wall still lit", () => {
    const quiet = viz.createAudio(silent);
    for (const t of [0, 3, 9.5]) {
      const s = state(quiet, t);
      expect(s.arcs.flat()).toEqual([]);
      expect(s.ring).toEqual([]);
      expect(s.hit).toBeNull();
      expect(s.debris).toEqual([]);
      expect(s.cone).toBe(1);
    }
    const lit = m.wallLight(0, 0);
    expect(lit.light).toBeGreaterThan(0.5); // never black
    const loud = m.wallLight(1, 1);
    expect(loud.light).toBeGreaterThan(lit.light);
    expect(loud.glow).toBeGreaterThan(lit.glow);
    expect(loud.light).toBeLessThanOrEqual(2);
    const bad = m.wallLight(NaN, NaN);
    expect(Number.isFinite(bad.light) && Number.isFinite(bad.glow)).toBe(true);
  });
});

describe("Live Wire motion: the title's fit", () => {
  const measure = (s: string) => [...s].reduce((w, c) => w + (c === " " ? 0.25 : 0.5), 0);

  it("keeps a short title big on one line", () => {
    expect(m.fitTitle("SONG NAME", measure, 1300, 2, 120, 40)).toEqual({
      size: 120,
      lines: ["SONG NAME"],
    });
  });

  it("wraps and shrinks a 60-character title so it fits", () => {
    const title = "THE EXTREMELY LONG NAMED ORCHESTRA AND FRIENDS FEATURING ALL";
    expect(title.length).toBe(60);
    const fit = m.fitTitle(title, measure, 1300, 2, 120, 40);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines.join(" ")).toBe(title);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(1300);
  });

  it("breaks a word too long for the line even at the smallest size", () => {
    const fit = m.fitTitle("X".repeat(60), measure, 600, 2, 120, 20);
    for (const line of fit.lines) expect(measure(line) * fit.size).toBeLessThanOrEqual(600);
    expect(fit.lines.join("")).toBe("X".repeat(60));
  });
});
