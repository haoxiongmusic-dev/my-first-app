// Cube Core's motion maths (templates/cube-core/assets/cube-motion.js): which cube moves on a
// beat, the rotation each cube holds, glides, drifts and jumps, the edge brightness and the
// readout's numbers. All worked out from the song time and the audio alone (or seeded by a beat's
// song frame), so any frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis, SECTION_PREROLL } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Quat = [number, number, number, number];
type Beat = { frame: number; age: number; strength: number };
type Behaviour = "snap" | "glide" | "raver" | "drift";
type CubeState = {
  rot: Quat[];
  scale: number[];
  flash: number[];
  active: boolean[];
  floorFlash: number;
};
type Motion = {
  SEED: number;
  CUBES: number;
  LOOKBACK: number;
  MAX_HITS: number;
  GLIDE_TIME: number;
  RAVER_JUMP: number;
  EDGE_RELEASE: number;
  DRIFT_RATES: number[];
  IDLE_RATES: number[];
  BEHAVIOURS: Behaviour[];
  behaviourLabel: (b: string) => string;
  beatsAt: (audio: ToolkitAudio, t: number) => Beat[];
  pickCube: (frame: number, mulberry32: VizToolkit["mulberry32"]) => number;
  beatRotation: (cube: number, frame: number, mulberry32: VizToolkit["mulberry32"]) => Quat;
  idleRotation: (cube: number, songTime: number, mulberry32: VizToolkit["mulberry32"]) => Quat;
  driftRotation: (cube: number, songTime: number, mulberry32: VizToolkit["mulberry32"]) => Quat;
  glideEase: (x: number) => number;
  slerp: (a: Quat, b: Quat, f: number) => Quat;
  quatAngle: (a: Quat, b: Quat) => number;
  cubesAt: (
    behaviour: string,
    beats: Beat[],
    songTime: number,
    mulberry32: VizToolkit["mulberry32"],
  ) => CubeState;
  edgeLevel: (env: number) => number;
  power: (loud: number, boost: number) => number;
  roomGlow: (power: number, floorFlash: number) => number;
  cubeAngles: (q: Quat) => [number, number, number];
  formatAngle: (deg: number) => string;
  formatPower: (power: number) => string;
};
const m = require("../../templates/cube-core/assets/cube-motion.js") as Motion;
const rand = viz.mulberry32;

type Frame = ToolkitAnalysis["frames"][number];
const FPS = 30;

/**
 * 14 s: silent for the first second, then music with a beat every second from 1 s to 10 s
 * (strong and weak in turn), a quick burst every 0.2 s from 10.2 s to 11 s, then silence.
 */
function hitTimes(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) out.push([1 + i, i % 2 === 0 ? 1 : 0.5]);
  for (let i = 1; i <= 4; i++) out.push([10 + i * 0.2, 0.8]);
  return out.map(([t, s]) => [Math.round(t * FPS) / FPS, s]);
}
function frames(): Frame[] {
  const hits = hitTimes();
  return Array.from({ length: 14 * FPS }, (_, i) => {
    const playing = i >= 30 && i < 11 * FPS;
    let k = 0;
    for (const [t, s] of hits) {
      const age = i / FPS - t;
      if (age >= 0) k = Math.max(k, s * Math.exp(-age / 0.2));
    }
    return {
      b: Array.from({ length: 32 }, (_, j) => (playing ? Math.max(0, 0.9 - j / 40) : 0)),
      l: playing ? 0.8 : 0,
      k: playing ? k : 0,
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
  hits: hitTimes(),
};
const silent: ToolkitAnalysis = {
  version: 1,
  fps: FPS,
  bands: 32,
  duration: 4,
  frames: Array.from({ length: 4 * FPS }, () => ({ b: new Array(32).fill(0), l: 0, k: 0, f: 0 })),
  hits: [],
};

function isUnitQuat(q: Quat): boolean {
  return q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < 1e-9;
}
function expectSameRot(a: Quat, b: Quat, digits = 9): void {
  expect(m.quatAngle(a, b)).toBeCloseTo(0, digits > 6 ? 6 : digits);
}
function state(audio: ToolkitAudio, t: number, behaviour: Behaviour): CubeState {
  return m.cubesAt(behaviour, m.beatsAt(audio, t), audio.songStart + t, rand);
}
const BEAT_TIMES = hitTimes().map(([t]) => t);

describe("Cube Core motion", () => {
  it("has the four behaviours, with readout names", () => {
    expect(m.BEHAVIOURS).toEqual(["snap", "glide", "raver", "drift"]);
    expect(m.behaviourLabel("snap")).toBe("SNAP");
    expect(m.behaviourLabel("glide")).toBe("GLIDE");
    expect(m.behaviourLabel("raver")).toBe("RAVER");
    expect(m.behaviourLabel("drift")).toBe("DRIFT");
    expect(m.behaviourLabel("nonsense")).toBe("SNAP");
    expect(m.CUBES).toBe(3);
  });

  it("beats: identified by their song frame, within the lookback, newest first", () => {
    const audio = viz.createAudio(full);
    const list = m.beatsAt(audio, 4.5);
    expect(list.map((b) => b.frame)).toEqual([120, 90, 60, 30]);
    expect(list[0].age).toBeCloseTo(0.5, 9);
    expect(list[0].strength).toBe(0.5);
    // a beat at exactly this moment counts already (rounding never hides it)
    expect(m.beatsAt(audio, 4)[0]).toMatchObject({ frame: 120 });
    expect(m.beatsAt(audio, 4 - 1e-9)[0]).toMatchObject({ frame: 120 });
    expect(m.beatsAt(audio, 4)[0].age).toBe(0);
    // only the last LOOKBACK seconds
    const late = m.beatsAt(audio, 9.5);
    expect(Math.max(...late.map((b) => b.age))).toBeLessThanOrEqual(m.LOOKBACK);
    expect(late.map((b) => b.frame)).toEqual([270, 240, 210, 180, 150]);
    // before the music: none; the lookback fits in a section's pre-roll
    expect(m.beatsAt(audio, 0.5)).toEqual([]);
    expect(m.LOOKBACK).toBeLessThanOrEqual(SECTION_PREROLL - 0.5);
    expect(m.LOOKBACK).toBeGreaterThanOrEqual(4);
    expect(m.MAX_HITS).toBeGreaterThanOrEqual(m.LOOKBACK / 0.15);
  });

  it("beats in a section have the same song frames and ages as in the full song", () => {
    const whole = viz.createAudio(full);
    for (const start of [2.5, 6, 9.1]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (let t = 0; t < 4; t += 1 / FPS) {
        const a = m.beatsAt(section, t);
        const b = m.beatsAt(whole, start + t);
        expect(a.map((x) => x.frame)).toEqual(b.map((x) => x.frame));
        for (let i = 0; i < a.length; i++) expect(a[i].age).toBeCloseTo(b[i].age, 5);
      }
    }
  });

  it("which cube moves on a beat: seeded by the song frame, all three get turns", () => {
    const counts = [0, 0, 0];
    for (let f = 0; f < 3000; f++) {
      const c = m.pickCube(f, rand);
      expect(c).toBe(m.pickCube(f, rand));
      expect([0, 1, 2]).toContain(c);
      counts[c]++;
    }
    for (const n of counts) expect(n).toBeGreaterThan(800);
    // regular beats (every 15 frames, 120 BPM) still visit every cube
    const regular = new Set<number>();
    for (let k = 0; k < 12; k++) regular.add(m.pickCube(1800 + 15 * k, rand));
    expect(regular.size).toBe(3);
  });

  it("beat rotations: unit quaternions from mulberry32(seed + song frame), one per cube", () => {
    for (const f of [0, 30, 1899, 7573]) {
      for (let c = 0; c < 3; c++) {
        const q = m.beatRotation(c, f, rand);
        expect(isUnitQuat(q)).toBe(true);
        expect(m.beatRotation(c, f, rand)).toEqual(q);
      }
      // the three cubes get different rotations on the same beat
      expect(m.quatAngle(m.beatRotation(0, f, rand), m.beatRotation(1, f, rand))).toBeGreaterThan(
        0.01,
      );
    }
    // the next beat brings a new rotation
    expect(m.quatAngle(m.beatRotation(0, 30, rand), m.beatRotation(0, 31, rand))).toBeGreaterThan(
      0.01,
    );
    // the seed is the song frame: a different seed source would give different rotations
    const r = rand(m.SEED + 30);
    expect(r()).toBeCloseTo(rand(m.SEED + 30)(), 12);
  });

  it("snap: on a beat one cube snaps to its new rotation; between beats all hold still", () => {
    const audio = viz.createAudio(full);
    for (const beat of BEAT_TIMES.slice(1, 9)) {
      const frame = Math.round(beat * FPS);
      const cube = m.pickCube(frame, rand);
      const before = state(audio, beat - 1 / FPS, "snap");
      const at = state(audio, beat, "snap");
      // the picked cube snaps at once to its seeded rotation
      expectSameRot(at.rot[cube], m.beatRotation(cube, frame, rand));
      // the others keep what they held (one with no beat in the lookback turns very slowly)
      const held = new Set(m.beatsAt(audio, beat - 1 / FPS).map((x) => m.pickCube(x.frame, rand)));
      for (let c = 0; c < 3; c++) {
        if (c === cube) continue;
        if (held.has(c)) expectSameRot(at.rot[c], before.rot[c]);
        else expect(m.quatAngle(at.rot[c], before.rot[c])).toBeLessThan(0.01);
      }
      // and it is the active one
      expect(at.active).toEqual([0, 1, 2].map((c) => c === cube));
      // its edges flash; the flash fades before the next beat
      expect(at.flash[cube]).toBeGreaterThan(0.45);
      expect(state(audio, beat + 0.9, "snap").flash[cube]).toBeLessThan(0.05);
    }
    // between two beats nothing moves (every cube that had a beat in the lookback holds it)
    for (const t0 of [3.05, 5.4, 7.2]) {
      const a = state(audio, t0, "snap");
      const b = state(audio, t0 + 0.5, "snap");
      const beats = m.beatsAt(audio, t0);
      for (let c = 0; c < 3; c++) {
        const own = beats.find((x) => m.pickCube(x.frame, rand) === c);
        if (!own) continue;
        expectSameRot(a.rot[c], m.beatRotation(c, own.frame, rand));
        expectSameRot(b.rot[c], a.rot[c]);
      }
      expect(a.scale).toEqual([1, 1, 1]);
    }
  });

  it("glide: each beat sets new targets and the cubes ease there over 0.6 s", () => {
    expect(m.GLIDE_TIME).toBe(0.6);
    // the ease: 0 → 1 over its time, rising all the way, clamped outside
    expect(m.glideEase(0)).toBe(0);
    expect(m.glideEase(1)).toBe(1);
    expect(m.glideEase(-1)).toBe(0);
    expect(m.glideEase(2)).toBe(1);
    expect(m.glideEase(NaN)).toBe(1);
    let prev = 0;
    for (let x = 0.05; x <= 1; x += 0.05) {
      expect(m.glideEase(x)).toBeGreaterThan(prev);
      prev = m.glideEase(x);
    }
    const audio = viz.createAudio(full);
    for (const beat of [3, 4, 5, 6]) {
      const frame = Math.round(beat * FPS);
      const at = state(audio, beat, "glide");
      const before = state(audio, beat - 1 / FPS, "glide");
      for (let c = 0; c < 3; c++) {
        const target = m.beatRotation(c, frame, rand);
        // the beat starts the glide from where the cube was (no jump)
        expect(m.quatAngle(at.rot[c], before.rot[c])).toBeLessThan(1e-6);
        // it gets steadily closer, and arrives 0.6 s later
        let dist = m.quatAngle(at.rot[c], target);
        for (let s = 0.1; s < 0.6; s += 0.1) {
          const d = m.quatAngle(state(audio, beat + s, "glide").rot[c], target);
          expect(d).toBeLessThan(dist);
          dist = d;
        }
        expectSameRot(state(audio, beat + 0.6, "glide").rot[c], target);
        expectSameRot(state(audio, beat + 0.9, "glide").rot[c], target);
        // half way through it is part of the way there
        const mid = m.quatAngle(state(audio, beat + 0.3, "glide").rot[c], target);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(m.quatAngle(before.rot[c], target));
      }
      // all three were given a new target: all active
      expect(at.active).toEqual([true, true, true]);
    }
    // quick beats (every 0.2 s) glide on from wherever the cube had got to, without jumps
    for (let t = 10; t < 11.2; t += 1 / FPS) {
      const a = state(audio, t, "glide");
      const b = state(audio, t + 1 / FPS, "glide");
      for (let c = 0; c < 3; c++) expect(m.quatAngle(a.rot[c], b.rot[c])).toBeLessThan(0.6);
    }
  });

  it("raver: all three snap on each beat, the sizes jump 10 % and the floor flashes", () => {
    expect(m.RAVER_JUMP).toBe(0.1);
    const audio = viz.createAudio(full);
    for (const beat of [2, 3, 6]) {
      const frame = Math.round(beat * FPS);
      const at = state(audio, beat, "raver");
      for (let c = 0; c < 3; c++) {
        expectSameRot(at.rot[c], m.beatRotation(c, frame, rand));
        expect(at.scale[c]).toBeCloseTo(1.1, 9);
      }
      expect(at.active).toEqual([true, true, true]);
      expect(at.floorFlash).toBeGreaterThan(0.45);
      // the jump falls back and the cubes hold until the next beat
      const later = state(audio, beat + 0.8, "raver");
      for (let c = 0; c < 3; c++) {
        expect(later.scale[c]).toBeLessThan(1.01);
        expect(later.scale[c]).toBeGreaterThanOrEqual(1);
        expectSameRot(later.rot[c], at.rot[c]);
      }
      expect(later.floorFlash).toBeLessThan(0.05);
    }
    for (let t = 0; t < 14; t += 0.07) {
      for (const s of state(audio, t, "raver").scale) expect(s).toBeLessThanOrEqual(1.1 + 1e-12);
    }
  });

  it("drift: all three turn slowly and steadily; beats only flash the edges", () => {
    expect(m.DRIFT_RATES).toHaveLength(3);
    for (let c = 0; c < 3; c++) {
      const rate = Math.abs(m.DRIFT_RATES[c]);
      expect(rate).toBeGreaterThanOrEqual(0.1);
      expect(rate).toBeLessThanOrEqual(0.6); // radians per second
      for (const s of [0, 3.3, 61, 250]) {
        const a = m.driftRotation(c, s, rand);
        expect(isUnitQuat(a)).toBe(true);
        expect(m.quatAngle(a, m.driftRotation(c, s + 1, rand))).toBeCloseTo(rate, 9);
        expect(m.quatAngle(a, m.driftRotation(c, s + 0.5, rand))).toBeCloseTo(rate / 2, 9);
      }
    }
    // the cubes turn at different rates
    expect(new Set(m.DRIFT_RATES.map(Math.abs)).size).toBe(3);
    const audio = viz.createAudio(full);
    for (let t = 0; t < 14; t += 0.31) {
      const s = state(audio, t, "drift");
      const quiet = m.cubesAt("drift", [], audio.songStart + t, rand);
      for (let c = 0; c < 3; c++) {
        expectSameRot(s.rot[c], m.driftRotation(c, t, rand));
        expectSameRot(s.rot[c], quiet.rot[c]);
        expect(s.scale[c]).toBe(1);
      }
      expect(s.floorFlash).toBe(0);
    }
    // the edges flash on the beat
    const at = state(audio, 3, "drift");
    for (const f of at.flash) expect(f).toBeGreaterThan(0.9);
    for (const f of state(audio, 3.9, "drift").flash) expect(f).toBeLessThan(0.05);
  });

  it("strong beats flash brighter than weak ones", () => {
    const audio = viz.createAudio(full);
    const strong = state(audio, 3, "raver").floorFlash; // strength 1
    const weak = state(audio, 4, "raver").floorFlash; // strength 0.5
    expect(strong).toBeGreaterThan(weak * 1.5);
    expect(Math.max(...state(audio, 3, "drift").flash)).toBeGreaterThan(
      Math.max(...state(audio, 4, "drift").flash) * 1.5,
    );
  });

  it("every behaviour in a section matches the full song, frame by frame", () => {
    const whole = viz.createAudio(full);
    for (const behaviour of m.BEHAVIOURS) {
      for (const start of [2.5, 6, 9.1]) {
        const section = viz.createAudio(sliceAnalysis(full, start, 14));
        expect(section.songStart).toBeCloseTo(start, 9);
        for (let t = 0; t < 4; t += 1 / FPS) {
          const a = state(section, t, behaviour);
          const b = state(whole, start + t, behaviour);
          for (let c = 0; c < 3; c++) {
            expect(m.quatAngle(a.rot[c], b.rot[c])).toBeLessThan(1e-5);
            expect(a.scale[c]).toBeCloseTo(b.scale[c], 5);
            expect(a.flash[c]).toBeCloseTo(b.flash[c], 5);
          }
          expect(a.active).toEqual(b.active);
          expect(a.floorFlash).toBeCloseTo(b.floorFlash, 5);
        }
      }
    }
  });

  it("silence: calm, deterministic, nothing NaN; the cubes turn very slowly", () => {
    const audio = viz.createAudio(silent);
    for (const behaviour of [...m.BEHAVIOURS, "nonsense"]) {
      for (let t = 0; t < 4; t += 0.25) {
        const s = state(audio, t, behaviour as Behaviour);
        expect(s).toEqual(state(audio, t, behaviour as Behaviour));
        for (let c = 0; c < 3; c++) {
          expect(isUnitQuat(s.rot[c])).toBe(true);
          expect(s.scale[c]).toBe(1);
          expect(s.flash[c]).toBe(0);
        }
        expect(s.floorFlash).toBe(0);
        if (behaviour !== "drift") {
          expect(s.active).toEqual([false, false, false]);
          for (let c = 0; c < 3; c++) expectSameRot(s.rot[c], m.idleRotation(c, t, rand));
        }
      }
    }
    for (let c = 0; c < 3; c++) {
      const rate = Math.abs(m.IDLE_RATES[c]);
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(Math.abs(m.DRIFT_RATES[c]));
      expect(m.quatAngle(m.idleRotation(c, 2, rand), m.idleRotation(c, 3, rand))).toBeCloseTo(
        rate,
        9,
      );
    }
    // NaN song times and beats never leak
    const odd = m.cubesAt("snap", [{ frame: NaN, age: NaN, strength: NaN }], NaN, rand);
    for (let c = 0; c < 3; c++) expect(isUnitQuat(odd.rot[c])).toBe(true);
    expect(odd.flash.every(Number.isFinite)).toBe(true);
    expect(m.beatsAt(audio, NaN)).toEqual([]);
  });

  it("edge brightness is 0.6 + 0.4 × the beat envelope", () => {
    expect(m.edgeLevel(0)).toBeCloseTo(0.6, 12);
    expect(m.edgeLevel(1)).toBeCloseTo(1, 12);
    expect(m.edgeLevel(0.5)).toBeCloseTo(0.8, 12);
    expect(m.edgeLevel(3)).toBeCloseTo(1, 12);
    expect(m.edgeLevel(-1)).toBeCloseTo(0.6, 12);
    expect(m.edgeLevel(NaN)).toBeCloseTo(0.6, 12);
    // from the audio: brighter on a beat than between beats, 0.6 in silence
    const audio = viz.createAudio(full);
    const on = m.edgeLevel(viz.beatEnvelope(audio, 3, m.EDGE_RELEASE));
    const off = m.edgeLevel(viz.beatEnvelope(audio, 3.8, m.EDGE_RELEASE));
    expect(on).toBeGreaterThan(0.95);
    expect(off).toBeLessThan(0.7);
    const quiet = viz.createAudio(silent);
    expect(m.edgeLevel(viz.beatEnvelope(quiet, 2, m.EDGE_RELEASE))).toBeCloseTo(0.6, 12);
  });

  it("power: the loudness, boosted by the spectrum boost, 0..1", () => {
    expect(m.power(0, 2)).toBe(0);
    expect(m.power(1, 2)).toBe(1);
    expect(m.power(0.5, 1)).toBeCloseTo(0.5, 12);
    expect(m.power(0.5, 2)).toBeCloseTo(0.75, 12);
    expect(m.power(0.5, 8)).toBeGreaterThan(m.power(0.5, 4));
    expect(m.power(NaN, 2)).toBe(0);
    expect(m.power(2, 2)).toBe(1);
    expect(m.power(0.5, NaN)).toBeCloseTo(0.5, 12);
    // the room's glow follows the power (and raver's floor flash), never NaN
    expect(m.roomGlow(1, 0)).toBeGreaterThan(m.roomGlow(0, 0) * 2.5);
    expect(m.roomGlow(0.5, 1)).toBeGreaterThan(m.roomGlow(0.5, 0));
    expect(m.roomGlow(0, 0)).toBeGreaterThan(0);
    expect(m.roomGlow(NaN, NaN)).toBe(m.roomGlow(0, 0));
    expect(m.formatPower(0.873)).toBe("087%");
    expect(m.formatPower(1)).toBe("100%");
    expect(m.formatPower(NaN)).toBe("000%");
  });

  it("readout numbers: each cube's angles from its rotation", () => {
    expect(m.cubeAngles([0, 0, 0, 1])).toEqual([0, 0, 0]);
    const s = Math.SQRT1_2;
    const z90 = m.cubeAngles([0, 0, s, s]);
    expect(z90[0]).toBeCloseTo(0, 9);
    expect(z90[1]).toBeCloseTo(0, 9);
    expect(z90[2]).toBeCloseTo(90, 9);
    const x270 = m.cubeAngles([-s, 0, 0, s]);
    expect(x270[0]).toBeCloseTo(270, 9);
    for (let f = 0; f < 200; f++) {
      for (const a of m.cubeAngles(m.beatRotation(f % 3, f, rand))) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(360);
      }
    }
    expect(m.formatAngle(4.36)).toBe("004.4");
    expect(m.formatAngle(127)).toBe("127.0");
    expect(m.formatAngle(359.97)).toBe("000.0");
    expect(m.formatAngle(NaN)).toBe("000.0");
    // in snap they change on the beat and hold between
    const audio = viz.createAudio(full);
    const a = state(audio, 5.2, "snap"),
      b = state(audio, 5.7, "snap");
    const moved = new Set(m.beatsAt(audio, 5.2).map((x) => m.pickCube(x.frame, rand)));
    expect(moved.size).toBeGreaterThan(0);
    for (const c of moved) expect(m.cubeAngles(a.rot[c])).toEqual(m.cubeAngles(b.rot[c]));
    // in drift they change all the time
    const d1 = state(audio, 5.2, "drift"),
      d2 = state(audio, 5.7, "drift");
    for (let c = 0; c < 3; c++) {
      expect(m.cubeAngles(d1.rot[c])).not.toEqual(m.cubeAngles(d2.rot[c]));
    }
  });
});
