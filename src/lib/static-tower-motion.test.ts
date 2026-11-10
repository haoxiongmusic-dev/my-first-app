// Static Tower's motion maths (templates/static-tower/assets/tower-motion.js): the screens'
// brightness (react centre or all), the static flash on strong hits, the lightning strike and the
// flash it brings, the sky's light, the horizon and ground spectrum, the clouds' drift, the
// stack's sway and the title's fit. All worked out from the song time and the audio alone, so any
// frame can be drawn on its own and a section matches the full song.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, ToolkitAudio, VizToolkit } from "../../templates/shared/viz-toolkit";
import { sliceAnalysis } from "@/lib/jobs";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type HitEvent = { age: number; strength: number; frame: number };
type Hit = { age: number; strength: number; frame: number } | null;
type Strike = {
  frame: number;
  age: number;
  seed: number;
  from: number;
  forks: number;
  bright: number;
  side: { x: number; to: number; seed: number } | null;
};
type Look = { tint: 0 | 1; amount: number; zoom: number; ox: number; oy: number; scan: number };
type Rand = VizToolkit["mulberry32"];
type Motion = {
  SEED: number;
  STRIKE: number;
  STRIKE_LIFE: number;
  FLASH_RELEASE: number;
  STATIC_LIFE: number;
  SPEC_MAX: number;
  CLOUD_SPEED: number;
  CLOUD_PERIOD: number;
  LEAN: number;
  TURN: number;
  hitEvents: (audio: ToolkitAudio, t: number) => HitEvent[];
  lastHit: (audio: ToolkitAudio, t: number) => Hit;
  strike: (events: HitEvent[], mulberry32: Rand) => Strike | null;
  flash: (events: HitEvent[], intensity: number) => number;
  screenStatic: (
    events: HitEvent[],
    count: number,
    fps: number,
    mulberry32: Rand,
  ) => { amount: Float32Array; seed: number };
  screenLevels: (
    react: string,
    env: number,
    hit: Hit,
    level: number,
    count: number,
    mulberry32: Rand,
  ) => Float32Array;
  screenLooks: (count: number, mulberry32: Rand) => Look[];
  loudLevel: (audio: ToolkitAudio, t: number) => number;
  skyLight: (level: number, flash: number) => { sky: number; floor: number; rim: number };
  specHeights: (
    values: ArrayLike<number>,
    intensity: number,
    boost: number,
    maxPx: number,
  ) => Float32Array;
  cloudDrift: (songTime: number) => number;
  towerSway: (songTime: number, mulberry32: Rand) => [number, number];
  fitTitle: (
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
    start: number,
    floor: number,
  ) => { size: number; lines: string[] };
};
const m = require("../../templates/static-tower/assets/tower-motion.js") as Motion;
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

describe("Static Tower motion: strong hits", () => {
  it("lists the strong hits with their song frame, the same in a section", () => {
    const whole = viz.createAudio(full);
    const ev = m.hitEvents(whole, 5.1);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.strength).toBeGreaterThanOrEqual(m.STRIKE);
      expect(e.age).toBeGreaterThanOrEqual(0);
      expect(e.age).toBeLessThanOrEqual(m.FLASH_RELEASE);
      expect(Number.isInteger(e.frame)).toBe(true);
    }
    expect(ev[0].frame).toBe(150); // the hit at 5 s
    const cut = viz.createAudio(sliceAnalysis(full, 4, 14));
    expect(m.hitEvents(cut, 1.1)).toEqual(ev.map((e) => ({ ...e, age: expect.closeTo(e.age, 6) })));
    expect(m.hitEvents(viz.createAudio(silent), 5)).toEqual([]);
    // the newest hit of any strength, for the screens' beat
    const last = m.lastHit(whole, 5.6);
    expect(last).toMatchObject({ frame: 165, strength: 0.4 });
    expect(m.lastHit(viz.createAudio(silent), 5)).toBeNull();
  });

  it("lightning strikes on a strong hit, seeded by its song frame, for a moment", () => {
    const at = (age: number, frame = 300) => [{ age, strength: 1, frame }];
    const now = m.strike(at(0.01), rand)!;
    expect(now).not.toBeNull();
    expect(now.frame).toBe(300);
    expect(now.bright).toBeGreaterThan(0.7);
    expect(now.bright).toBeLessThanOrEqual(1);
    expect(Math.abs(now.from)).toBeLessThanOrEqual(300);
    expect(now.forks).toBeGreaterThanOrEqual(1);
    // the same strike all through its life (the bolt keeps its shape) …
    const later = m.strike(at(0.2), rand)!;
    expect(later.seed).toBe(now.seed);
    expect(later.from).toBe(now.from);
    expect(later.side).toEqual(now.side);
    expect(later.bright).toBeLessThan(now.bright);
    // … gone after its life
    expect(m.strike(at(m.STRIKE_LIFE + 0.001), rand)).toBeNull();
    expect(m.STRIKE_LIFE).toBeLessThanOrEqual(0.5);
    // another hit, another bolt
    expect(m.strike(at(0.01, 301), rand)!.seed).not.toBe(now.seed);
    // weak hits never strike
    expect(m.strike([], rand)).toBeNull();
    // sometimes a second bolt off to the side
    let sides = 0;
    for (let f = 0; f < 200; f++) {
      const s = m.strike(at(0.05, f), rand)!;
      if (s.side) {
        sides++;
        expect(Math.abs(s.side.x - 960)).toBeGreaterThan(350);
        expect(s.side.x).toBeGreaterThan(0);
        expect(s.side.x).toBeLessThan(1920);
      }
    }
    expect(sides).toBeGreaterThan(20);
    expect(sides).toBeLessThan(120);
  });

  it("the sky flashes with a strike and fades over 0.4 s", () => {
    expect(m.FLASH_RELEASE).toBeCloseTo(0.4, 9);
    const f = (age: number) => m.flash([{ age, strength: 1, frame: 9 }], 1);
    expect(f(0)).toBeGreaterThan(0.8);
    expect(f(0)).toBeLessThanOrEqual(1);
    expect(f(0.1)).toBeLessThan(f(0));
    expect(f(0.3)).toBeLessThan(f(0.1));
    expect(f(0.3)).toBeGreaterThan(0);
    expect(f(0.4)).toBe(0);
    expect(f(0.6)).toBe(0);
    expect(m.flash([], 1)).toBe(0);
    expect(m.flash([{ age: 0, strength: 1, frame: 1 }], 0.2)).toBeLessThan(f(0));
    expect(m.flash([{ age: NaN, strength: NaN, frame: 1 }], NaN)).toBe(0);
  });

  it("screens flash to static for at most 0.15 s, the same screens and noise for a hit", () => {
    expect(m.STATIC_LIFE).toBeLessThanOrEqual(0.15);
    const hit = (age: number, frame = 300) => [{ age, strength: 1, frame }];
    const a = m.screenStatic(hit(0.02), 15, FPS, rand);
    expect(a.amount).toHaveLength(15);
    const on = Array.from(a.amount).filter((x) => x > 0).length;
    expect(on).toBeGreaterThanOrEqual(3);
    for (const x of a.amount) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(m.screenStatic(hit(0.02), 15, FPS, rand)).toEqual(a);
    // the same screens a frame later, new noise, fading
    const b = m.screenStatic(hit(0.02 + 1 / 30), 15, FPS, rand);
    expect(Array.from(b.amount).map((x) => x > 0)).toEqual(Array.from(a.amount).map((x) => x > 0));
    expect(b.seed).not.toBe(a.seed);
    expect(Math.max(...b.amount)).toBeLessThan(Math.max(...a.amount));
    // over by 0.15 s
    expect(Array.from(m.screenStatic(hit(m.STATIC_LIFE), 15, FPS, rand).amount)).toEqual(
      new Array(15).fill(0),
    );
    expect(Array.from(m.screenStatic([], 15, FPS, rand).amount)).toEqual(new Array(15).fill(0));
    // another hit picks other screens
    const other = m.screenStatic(hit(0.02, 777), 15, FPS, rand);
    expect(Array.from(other.amount).map((x) => x > 0)).not.toEqual(
      Array.from(a.amount).map((x) => x > 0),
    );
  });
});

describe("Static Tower motion: the screens", () => {
  const hit = { age: 0.05, strength: 1, frame: 420 };

  it("centre: the top TV is the bright main one, the others dim and flicker with the beat", () => {
    const quiet = m.screenLevels("centre", 0, hit, 0.5, 15, rand);
    const beat = m.screenLevels("centre", 1, hit, 0.5, 15, rand);
    expect(quiet).toHaveLength(15);
    for (let i = 1; i < 15; i++) {
      expect(quiet[0]).toBeGreaterThan(quiet[i] * 2);
      expect(beat[0]).toBeGreaterThan(beat[i]);
      expect(beat[i]).toBeGreaterThanOrEqual(quiet[i]);
    }
    // on the beat the others light up, each its own amount, a new pattern for each beat
    const others = Array.from(beat.slice(1));
    expect(Math.max(...others)).toBeGreaterThan(Math.max(...Array.from(quiet.slice(1))) * 1.5);
    expect(new Set(others.map((x) => x.toFixed(3))).size).toBeGreaterThan(5);
    const next = m.screenLevels("centre", 1, { ...hit, frame: 435 }, 0.5, 15, rand);
    expect(Array.from(next.slice(1))).not.toEqual(others);
    expect(m.screenLevels("centre", 1, hit, 0.5, 15, rand)).toEqual(beat);
  });

  it("all: every screen pulses together", () => {
    const quiet = m.screenLevels("all", 0, hit, 0.5, 15, rand);
    const beat = m.screenLevels("all", 1, hit, 0.5, 15, rand);
    for (let i = 0; i < 15; i++) {
      expect(beat[i]).toBeGreaterThan(quiet[i] * 1.4);
      expect(quiet[i]).toBeGreaterThan(0.3);
      // all about as bright as each other
      expect(Math.abs(beat[i] - beat[0])).toBeLessThan(0.15 * beat[0]);
    }
    // the same pulse whatever the beat's pattern
    expect(m.screenLevels("all", 1, { ...hit, frame: 435 }, 0.5, 15, rand)).toEqual(beat);
  });

  it("levels are finite and capped; louder music is brighter", () => {
    for (const react of ["centre", "all", "nonsense"])
      for (const env of [0, 0.5, 1, 5, NaN])
        for (const level of [0, 1, 3, NaN])
          for (const h of [hit, null])
            for (const x of m.screenLevels(react, env, h, level, 15, rand)) {
              expect(Number.isFinite(x)).toBe(true);
              expect(x).toBeGreaterThan(0);
              expect(x).toBeLessThanOrEqual(1.6);
            }
    expect(m.screenLevels("all", 0.5, hit, 1, 15, rand)[3]).toBeGreaterThan(
      m.screenLevels("all", 0.5, hit, 0, 15, rand)[3],
    );
  });

  it("each screen has its own fixed treatment: tint, crop and scanlines", () => {
    const looks = m.screenLooks(15, rand);
    expect(looks).toHaveLength(15);
    expect(m.screenLooks(15, rand)).toEqual(looks);
    // the main screen shows the picture nearly as it is, whole
    expect(looks[0].zoom).toBe(1);
    expect(looks[0].amount).toBeLessThan(0.3);
    expect(new Set(looks.map((l) => l.tint)).size).toBe(2);
    expect(new Set(looks.map((l) => l.zoom.toFixed(2))).size).toBeGreaterThan(5);
    for (const l of looks) {
      expect(l.zoom).toBeGreaterThanOrEqual(1);
      expect(l.zoom).toBeLessThanOrEqual(2);
      // the crop stays inside the picture
      const room = (1 - 1 / l.zoom) / 2;
      expect(Math.abs(l.ox)).toBeLessThanOrEqual(room + 1e-9);
      expect(Math.abs(l.oy)).toBeLessThanOrEqual(room + 1e-9);
      expect(l.amount).toBeGreaterThanOrEqual(0);
      expect(l.amount).toBeLessThanOrEqual(1);
      expect(l.scan).toBeGreaterThanOrEqual(2);
      expect(l.scan).toBeLessThanOrEqual(5);
    }
  });
});

describe("Static Tower motion: the sky, the spectrum, the clouds", () => {
  it("the loudness level averages the last moment, 0 in silence, the same in a section", () => {
    const whole = viz.createAudio(full);
    expect(m.loudLevel(viz.createAudio(silent), 5)).toBe(0);
    expect(m.loudLevel(whole, 0.5)).toBe(0);
    expect(m.loudLevel(whole, 5)).toBeGreaterThan(0.2);
    expect(m.loudLevel(whole, 5)).toBeLessThanOrEqual(1);
    const cut = viz.createAudio(sliceAnalysis(full, 4, 14));
    for (const t of [0, 0.3, 1.7]) expect(m.loudLevel(cut, t)).toBe(m.loudLevel(whole, 4 + t));
  });

  it("the sky and floor light: never black, brighter when loud and on a flash", () => {
    const rest = m.skyLight(0, 0);
    const loud = m.skyLight(1, 0);
    const flash = m.skyLight(1, 1);
    expect(rest.sky).toBeGreaterThan(0.4);
    expect(loud.sky).toBeGreaterThan(rest.sky * 1.4);
    expect(flash.sky).toBeGreaterThan(loud.sky);
    expect(flash.rim).toBeGreaterThan(rest.rim * 3);
    expect(flash.floor).toBeGreaterThan(rest.floor);
    const bad = m.skyLight(NaN, NaN);
    for (const k of ["sky", "floor", "rim"] as const) expect(Number.isFinite(bad[k])).toBe(true);
  });

  it("horizon and ground lines: at most 60 px, shaped into peaks, flat in silence", () => {
    expect(m.SPEC_MAX).toBe(60);
    const bars = viz.mirrorBars(
      Float32Array.from({ length: 48 }, (_, i) => 0.62 + 0.28 * Math.sin(i * 0.7)),
      80,
      true,
    );
    for (const intensity of [0.2, 1, 2, 9])
      for (const boost of [1, 2, 4, 8])
        for (const x of m.specHeights(bars, intensity, boost, m.SPEC_MAX)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(60);
        }
    const h = Array.from(m.specHeights(bars, 1, 8, 60)).sort((a, b) => a - b);
    expect(h[h.length - 1]).toBeGreaterThan(35);
    expect(h[Math.floor(h.length / 2)]).toBeLessThan(h[h.length - 1] * 0.75);
    // the bass in the middle, mirrored out
    const mid = m.specHeights(bars, 1, 8, 60);
    expect(mid[0]).toBeCloseTo(mid[79], 5);
    expect(Array.from(m.specHeights(new Float32Array(10), 1, 8, 60))).toEqual(
      new Array(10).fill(0),
    );
    expect(Array.from(m.specHeights([NaN, NaN], 1, 8, 60))).toEqual([0, 0]);
  });

  it("the clouds drift slowly with the song time, wrapping round", () => {
    expect(m.CLOUD_SPEED).toBeGreaterThan(0);
    expect(m.CLOUD_SPEED).toBeLessThanOrEqual(12); // px a second: slow
    expect(m.cloudDrift(0)).toBe(0);
    expect(m.cloudDrift(10)).toBeCloseTo(10 * m.CLOUD_SPEED, 9);
    for (const s of [0, 3.3, 77, 1234.5, 3599]) {
      const d = m.cloudDrift(s);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(m.CLOUD_PERIOD);
    }
    expect(m.cloudDrift(NaN)).toBe(0);
    // whole pixels: between steps the sky is exactly the same, which keeps encoding quick
    for (let s = 0; s < 60; s += 0.37) expect(Number.isInteger(m.cloudDrift(s))).toBe(true);
    let steps = 0;
    for (let f = 1; f < 300; f++) if (m.cloudDrift(f / 30) !== m.cloudDrift((f - 1) / 30)) steps++;
    expect(steps).toBeLessThan(300 / 2);
    expect(steps).toBeGreaterThan(20);
  });

  it("the stack turns a little to the side and sways slowly", () => {
    let prev = m.towerSway(0, rand);
    for (let s = 0; s < 300; s += 1 / 30) {
      const [x, y] = m.towerSway(s, rand);
      expect(Math.abs(x - m.LEAN)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(y - m.TURN)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(x - prev[0]) + Math.abs(y - prev[1])).toBeLessThan(0.005); // a step: under a px
      prev = [x, y];
    }
    expect(Math.abs(m.TURN)).toBeGreaterThan(0.08); // seen at an angle, not dead on
    // it moves only twice a second (the frames between match exactly), by tiny steps
    let changes = 0;
    for (let f = 1; f < 300; f++) {
      const a = m.towerSway(f / 30, rand),
        b = m.towerSway((f - 1) / 30, rand);
      if (a[0] !== b[0] || a[1] !== b[1]) changes++;
    }
    expect(changes).toBeLessThanOrEqual(21);
    expect(changes).toBeGreaterThan(10);
    expect(m.towerSway(77.7, rand)).toEqual(m.towerSway(77.7, rand));
    expect(m.towerSway(NaN, rand).every(Number.isFinite)).toBe(true);
  });
});

describe("Static Tower motion: a section matches the full song", () => {
  function state(audio: ToolkitAudio, t: number) {
    const ev = m.hitEvents(audio, t);
    const hit = m.lastHit(audio, t);
    const env = viz.beatEnvelope(audio, t, 0.25);
    return {
      strike: m.strike(ev, rand),
      flash: m.flash(ev, 1),
      stat: m.screenStatic(ev, 15, audio.fps, rand),
      levels: m.screenLevels("centre", env, hit, m.loudLevel(audio, t), 15, rand),
      drift: m.cloudDrift(t + audio.songStart),
    };
  }

  it("the strike, flash, static, screens and clouds are the same at the same song time", () => {
    const whole = viz.createAudio(full);
    for (const start of [2.5, 5, 7.25]) {
      const section = viz.createAudio(sliceAnalysis(full, start, 14));
      for (const t of [0, 0.04, 0.1, 0.5, 1.13, 2.6]) {
        const a = state(section, t);
        const b = state(whole, start + t);
        expect(a.strike?.seed).toBe(b.strike?.seed);
        expect(a.strike?.from).toBe(b.strike?.from);
        expect(a.strike?.side).toEqual(b.strike?.side);
        expect(a.strike?.bright ?? 0).toBeCloseTo(b.strike?.bright ?? 0, 6);
        expect(a.flash).toBeCloseTo(b.flash, 6);
        expect(a.stat.seed).toBe(b.stat.seed);
        expect(Array.from(a.stat.amount)).toEqual(
          Array.from(b.stat.amount).map((x) => expect.closeTo(x, 6)),
        );
        Array.from(a.levels).forEach((x, i) => expect(x).toBeCloseTo(b.levels[i], 5));
        expect(a.drift).toBeCloseTo(b.drift, 6);
      }
    }
  });

  it("silence draws a calm frame: no strike, no flash, no static, the screens steady", () => {
    const quiet = viz.createAudio(silent);
    for (const t of [0, 3, 9.5]) {
      const s = state(quiet, t);
      expect(s.strike).toBeNull();
      expect(s.flash).toBe(0);
      expect(Array.from(s.stat.amount)).toEqual(new Array(15).fill(0));
      for (const x of s.levels) expect(Number.isFinite(x) && x > 0).toBe(true);
    }
    expect(state(quiet, 3).levels).toEqual(state(quiet, 9.5).levels);
  });
});

describe("Static Tower motion: the title's fit", () => {
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
