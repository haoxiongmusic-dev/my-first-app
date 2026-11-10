// The shared template toolkit is plain browser JavaScript; under Node it loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ToolkitAnalysis, VizToolkit } from "../../templates/shared/viz-toolkit";

const require = createRequire(import.meta.url);
const viz = require("../../templates/shared/viz-toolkit.js") as VizToolkit;

type Frame = ToolkitAnalysis["frames"][number];

function frame(overrides: Partial<Frame> = {}): Frame {
  return { b: new Array(32).fill(0), l: 0, k: 0, f: 0, ...overrides };
}

function fakeAnalysis(frames: Frame[], hits: [number, number][] = []): ToolkitAnalysis {
  return { version: 1, fps: 30, bands: 32, duration: frames.length / 30, frames, hits };
}

describe("mulberry32", () => {
  it("repeats for the same seed and stays in [0,1)", () => {
    const a = viz.mulberry32(777);
    const b = viz.mulberry32(777);
    const first = Array.from({ length: 1000 }, () => a());
    const second = Array.from({ length: 1000 }, () => b());
    expect(first).toEqual(second);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("hexToRGB", () => {
  it("reads #rrggbb and #rgb", () => {
    expect(viz.hexToRGB("#ff6a12")).toEqual([1, 106 / 255, 18 / 255]);
    expect(viz.hexToRGB("#fff")).toEqual([1, 1, 1]);
    expect(() => viz.hexToRGB("orange")).toThrow(/Not a colour/);
  });
});

describe("bandEdges", () => {
  it("match the analyzer", () => {
    const edges = viz.bandEdges();
    expect(edges).toHaveLength(33);
    expect(edges[0]).toBeCloseTo(30, 6);
    expect(edges[32]).toBeCloseTo(16000, 6);
    expect(edges[8]).toBeCloseTo(144.1687, 3); // numpy.geomspace(30, 16000, 33)[8]
  });
});

describe("createAudio", () => {
  it("songStart is where a section starts in the whole song (0 for a whole song)", () => {
    const data = fakeAnalysis([frame(), frame()]);
    expect(viz.createAudio({ ...data, sectionStart: 12 }).songStart).toBe(12);
    expect(viz.createAudio(data).songStart).toBe(0);
  });

  it("sample interpolates between frames and clamps time", () => {
    const audio = viz.createAudio(fakeAnalysis([frame({ l: 0 }), frame({ l: 1 })]));
    expect(audio.sample(0.5 / 30).loud).toBeCloseTo(0.5, 6);
    expect(audio.sample(-1).loud).toBe(0);
    expect(audio.sample(999).loud).toBe(1);
  });

  it("kick beat range uses the analyzer's kick and hits", () => {
    const frames = Array.from({ length: 90 }, (_, i) => frame({ k: i / 100 }));
    const hits: [number, number][] = [
      [0.5, 0.8],
      [1.2, 0.6],
      [2.5, 1],
    ];
    const audio = viz.createAudio(fakeAnalysis(frames, hits));
    expect(audio.sample(1.5 / 30).beat).toBeCloseTo(0.015, 6);
    const recent = audio.recentHits(2.0, 4);
    expect(recent).toHaveLength(2);
    expect(recent[0][0]).toBeCloseTo(0.8, 6);
    expect(recent[0][1]).toBe(0.6);
    expect(recent[1][0]).toBeCloseTo(1.5, 6);
    expect(recent[1][1]).toBe(0.8);
  });

  it("a Hz beat range finds pulses in its own bands", () => {
    const frames = Array.from({ length: 60 }, (_, i) => {
      const b = new Array(32).fill(0);
      if (i >= 30) for (let k = 0; k <= 5; k++) b[k] = 1;
      return frame({ b });
    });
    const data = fakeAnalysis(frames);
    const low = viz.createAudio(data, { beatRange: "20-90" });
    const lowHits = low.recentHits(2, 10);
    expect(lowHits).toHaveLength(1);
    expect(Math.abs(2 - lowHits[0][0] - 1.0)).toBeLessThanOrEqual(1 / 30 + 1e-6);
    expect(low.sample(1.0).beat).toBeGreaterThan(0.5);
    const high = viz.createAudio(data, { beatRange: "3000-8000" });
    expect(high.recentHits(2, 10)).toHaveLength(0);
  });

  it("default spectrum equals the bands", () => {
    const b = Array.from({ length: 32 }, (_, k) => k / 31);
    const audio = viz.createAudio(fakeAnalysis([frame({ b }), frame({ b })]));
    const spectrum = audio.spectrum(0);
    const bands = audio.sample(0).bands;
    expect(spectrum).toHaveLength(32);
    for (let k = 0; k < 32; k++) expect(spectrum[k]).toBeCloseTo(bands[k], 6);
  });

  it("spectrum range and boost", () => {
    const b = Array.from({ length: 32 }, (_, k) => (k <= 8 ? 0.5 : 0.9));
    const data = fakeAnalysis([frame({ b })]);
    const low = viz.createAudio(data, { spectrumLow: 30, spectrumHigh: 144.3 }).spectrum(0);
    expect(low).toHaveLength(32);
    expect(Array.from(low).every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    const boosted = viz.createAudio(data, {
      spectrumLow: 30,
      spectrumHigh: 144.3,
      spectrumBoost: 2,
    });
    expect(boosted.spectrum(0)[0]).toBeCloseTo(0.75, 6);
  });

  it("spectrum with low ≥ high falls back to a valid range", () => {
    const b = Array.from({ length: 32 }, (_, k) => k / 31);
    const data = fakeAnalysis([frame({ b })]);
    const swapped = viz.createAudio(data, { spectrumLow: 5000, spectrumHigh: 100 }).spectrum(0);
    const normal = viz.createAudio(data, { spectrumLow: 100, spectrumHigh: 5000 }).spectrum(0);
    expect(Array.from(swapped)).toEqual(Array.from(normal));
    const same = viz.createAudio(data, { spectrumLow: 1000, spectrumHigh: 1000 }).spectrum(0);
    expect(Array.from(same).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  });
});

describe("createAudio with an offset (a section of a song)", () => {
  // A sliced analysis keeps a few seconds before the section; `offset` says how many.
  const frames = Array.from({ length: 300 }, (_, i) =>
    frame({ l: i / 300, b: new Array(32).fill(i / 300) }),
  );
  const data = {
    ...fakeAnalysis(frames, [
      [5.5, 0.7],
      [6.5, 0.9],
    ]),
    offset: 6,
  };

  it("time 0 is the section start", () => {
    const audio = viz.createAudio(data);
    expect(audio.sample(0).loud).toBeCloseTo(180 / 300, 6);
    expect(audio.spectrum(-1)[0]).toBeCloseTo(150 / 300, 6);
  });

  it("hits from before the section still count", () => {
    const recent = viz.createAudio(data).recentHits(1, 4);
    expect(recent).toHaveLength(2);
    expect(recent[0][0]).toBeCloseTo(0.5, 6);
    expect(recent[1][0]).toBeCloseTo(1.5, 6);
  });

  it("spectrum is silent before the song begins", () => {
    const steady = Array.from({ length: 60 }, () => frame({ b: new Array(32).fill(0.5) }));
    const audio = viz.createAudio(fakeAnalysis(steady));
    expect(Array.from(audio.spectrum(-0.5)).every((v) => v === 0)).toBe(true);
    expect(audio.spectrum(0)[0]).toBeCloseTo(0.5, 6);
  });
});

describe("WebGL helpers", () => {
  // A stand-in for a WebGL context: just enough to drive createProgram and createTarget.
  function fakeGl(opts: { compiles?: (type: number) => boolean; links?: boolean; log?: string }) {
    const calls: { texType?: number } = {};
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      ACTIVE_UNIFORMS: 5,
      TEXTURE_2D: 6,
      RGBA: 7,
      UNSIGNED_BYTE: 8,
      FRAMEBUFFER: 9,
      COLOR_ATTACHMENT0: 10,
      FRAMEBUFFER_COMPLETE: 11,
      createShader: (type: number) => ({ type }),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: (s: { type: number }) => (opts.compiles ? opts.compiles(s.type) : true),
      getShaderInfoLog: () => opts.log ?? "",
      createProgram: () => ({}),
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: (_p: unknown, what: number) => (what === 4 ? (opts.links ?? true) : 0),
      getProgramInfoLog: () => opts.log ?? "",
      getActiveUniform: () => null,
      getUniformLocation: () => null,
      createTexture: () => ({}),
      bindTexture: () => {},
      texImage2D: (...args: unknown[]) => {
        calls.texType = args[7] as number;
      },
      texParameteri: () => {},
      createFramebuffer: () => ({}),
      bindFramebuffer: () => {},
      framebufferTexture2D: () => {},
      checkFramebufferStatus: () => 11,
    };
    return { gl: gl as unknown as WebGLRenderingContext, calls };
  }

  it("createProgram throws a clear error when shaders fail to link", () => {
    const { gl } = fakeGl({ links: false, log: "precision mismatch" });
    expect(() => viz.createProgram(gl, "vs", "fs")).toThrow(/didn't link: precision mismatch/);
  });

  it("createProgram throws when a shader fails to compile", () => {
    const { gl } = fakeGl({
      compiles: (type) => type !== 2,
      log: `syntax error${String.fromCharCode(0)}`,
    });
    expect(() => viz.createProgram(gl, "vs", "fs")).toThrow(
      /didn't compile \(fragment\): syntax error$/,
    );
  });

  it("createTarget uses 8-bit textures", () => {
    const { gl, calls } = fakeGl({});
    viz.createTarget(gl, 64, 32);
    expect(calls.texType).toBe(8);
  });
});

describe("Hz beat ranges in a section", () => {
  it("find the same hits as the whole song, scaled against the whole song", () => {
    // A loud passage early on, then a quieter passage with smaller bass rises.
    const frames = Array.from({ length: 900 }, (_, i) => {
      const loudPart = i < 450;
      const onBeat = i % 15 === 0;
      const level = onBeat ? (loudPart ? 1 : 0.3) : 0;
      return frame({ b: Array.from({ length: 32 }, (_, k) => (k <= 5 ? level : 0)) });
    });
    const full = fakeAnalysis(frames);
    const whole = viz.createAudio(full, { beatRange: "20-90" });
    // The section 20–28 s with 6 s of pre-roll, as the job builder slices it.
    const first = 14 * 30;
    const part = {
      ...fakeAnalysis(frames.slice(first, 28 * 30 + 1)),
      duration: 8,
      offset: 6,
      beatScales: viz.beatScales(full.frames),
    };
    const section = viz.createAudio(part, { beatRange: "20-90" });
    for (const t of [21, 23.5, 26]) {
      expect(section.recentHits(t - 20, 3)).toEqual(
        whole.recentHits(t, 3).map(([age, s]) => [expect.closeTo(age, 6), expect.closeTo(s, 6)]),
      );
      expect(section.sample(t - 20).beat).toBeCloseTo(whole.sample(t).beat, 6);
    }
  });
});

describe("live preview helpers", () => {
  it("declaredDefaults reads every default", () => {
    const json = JSON.stringify([
      { id: "title", type: "string", label: "Title", default: "It&#39;s" },
      { id: "intensity", type: "number", label: "Intensity", default: 1 },
    ]);
    expect(viz.declaredDefaults(json)).toEqual({ title: "It's", intensity: 1 });
  });

  it("trackGl deletes what it created", () => {
    const deleted: string[] = [];
    const fake = {
      createBuffer: () => ({ kind: "buffer" }),
      createTexture: () => ({ kind: "texture" }),
      createFramebuffer: () => ({ kind: "framebuffer" }),
      createProgram: () => ({ kind: "program" }),
      createShader: () => ({ kind: "shader" }),
      deleteBuffer: () => deleted.push("buffer"),
      deleteTexture: () => deleted.push("texture"),
      deleteFramebuffer: () => deleted.push("framebuffer"),
      deleteProgram: () => deleted.push("program"),
      deleteShader: () => deleted.push("shader"),
      getParameter: () => 7,
    } as unknown as WebGLRenderingContext;
    const tracked = viz.trackGl(fake);
    tracked.gl.createBuffer();
    tracked.gl.createBuffer();
    tracked.gl.createTexture();
    tracked.gl.createProgram();
    expect(tracked.gl.getParameter(0)).toBe(7); // everything else passes straight through
    tracked.dispose();
    expect(deleted.sort()).toEqual(["buffer", "buffer", "program", "texture"]);
    tracked.dispose();
    expect(deleted).toHaveLength(4); // nothing deleted twice
  });
});

describe("ring kit", () => {
  const DEG = Math.PI / 180;

  it("ringAngles spreads points evenly over an arc centred on the top", () => {
    const four = Array.from(viz.ringAngles(4, 360));
    [-135, -45, 45, 135].forEach((deg, i) => expect(four[i]).toBeCloseTo(deg * DEG, 6));
    const five = Array.from(viz.ringAngles(5, 220));
    five.forEach((a, i) => {
      expect(a).toBeCloseTo(-five[4 - i], 6); // symmetric about the top
      expect(Math.abs(a)).toBeLessThanOrEqual(110 * DEG + 1e-6);
    });
    for (let i = 1; i < 5; i++) expect(five[i] - five[i - 1]).toBeCloseTo(44 * DEG, 6);
    expect(Array.from(viz.ringAngles(1, 360))).toEqual([0]);
  });

  it("ringPoint on a circle has length 1 and points outward", () => {
    for (const a of Array.from(viz.ringAngles(24, 360))) {
      const [x, y, nx, ny] = viz.ringPoint(a, "circle");
      expect(Math.hypot(x, y)).toBeCloseTo(1, 9);
      expect(nx).toBeCloseTo(x, 9);
      expect(ny).toBeCloseTo(y, 9);
    }
    viz.ringPoint(0, "circle").forEach((v, i) => expect(v).toBeCloseTo([0, -1, 0, -1][i], 9));
  });

  it("ringPoint on a rounded square sits on x⁴ + y⁴ = 1 with outward unit normals", () => {
    for (const a of Array.from(viz.ringAngles(24, 360))) {
      const [x, y, nx, ny] = viz.ringPoint(a, "rounded");
      expect(x ** 4 + y ** 4).toBeCloseTo(1, 6);
      expect(Math.hypot(nx, ny)).toBeCloseTo(1, 9);
      expect(nx * x + ny * y).toBeGreaterThan(0);
    }
    const [, , nx, ny] = viz.ringPoint(Math.PI / 4, "rounded");
    expect(nx).toBeCloseTo(Math.SQRT1_2, 6);
    expect(ny).toBeCloseTo(-Math.SQRT1_2, 6); // up and right: y points down on screen
  });

  it("ringValues puts the bass at the top, mirrored, the last band at the arc ends", () => {
    const v = Array.from(viz.ringValues([1, 0.5, 0], viz.ringAngles(4, 360), 360));
    expect(v[0]).toBeCloseTo(v[3], 9);
    expect(v[1]).toBeCloseTo(v[2], 9);
    expect(viz.ringValues([1, 0.5, 0], [0], 360)[0]).toBe(1);
    expect(viz.ringValues([1, 0.5, 0], [Math.PI], 360)[0]).toBeCloseTo(0, 9);
    expect(viz.ringValues([1, 0.5, 0], [-Math.PI], 360)[0]).toBeCloseTo(0, 9);
    expect(viz.ringValues([1, 0.5, 0], [Math.PI / 2], 360)[0]).toBeCloseTo(0.5, 9);
  });

  it("beatEnvelope follows the beat and fades over the release", () => {
    const kick = Array.from({ length: 120 }, (_, i) => frame({ k: i === 30 ? 1 : 0 }));
    const audio = viz.createAudio(fakeAnalysis(kick));
    const quiet = viz.createAudio(fakeAnalysis(Array.from({ length: 120 }, () => frame())));
    expect(viz.beatEnvelope(quiet, 1, 0.18)).toBe(0);
    expect(viz.beatEnvelope(audio, 0.5, 0.18)).toBe(0);
    expect(viz.beatEnvelope(audio, 1.0, 0.18)).toBeGreaterThan(0.9);
    expect(viz.beatEnvelope(audio, 1.18, 0.18)).toBeCloseTo(Math.exp(-1), 1);
    expect(viz.beatEnvelope(audio, 0, 0.18)).toBe(0); // never reads before the start
  });

  it("bandsToRingCount maps 10 % to a fifth of the ring and 100 % to all of it", () => {
    expect(viz.bandsToRingCount(10, 120)).toBe(24);
    expect(viz.bandsToRingCount(100, 120)).toBe(120);
    expect(viz.bandsToRingCount(100, 72)).toBe(72);
  });
});

describe("song clock (M8 spec §5.1)", () => {
  it("counts the whole song's time, also in a section", () => {
    const whole = viz.createAudio(fakeAnalysis(Array.from({ length: 300 }, () => frame())));
    expect(whole.songDuration).toBe(10);
    expect(viz.songClock(whole, 4)).toEqual({ elapsed: 4, total: 10, fraction: 0.4 });
    const part = viz.createAudio({
      ...fakeAnalysis(Array.from({ length: 90 }, () => frame())),
      duration: 2,
      offset: 1,
      sectionStart: 7,
      songDuration: 10,
    });
    expect(part.songDuration).toBe(10);
    const c = viz.songClock(part, 0.5);
    expect(c.elapsed).toBeCloseTo(7.5, 6);
    expect(c.total).toBe(10);
    expect(c.fraction).toBeCloseTo(0.75, 6);
  });

  it("clamps at the ends and never divides by zero", () => {
    const a = viz.createAudio(fakeAnalysis(Array.from({ length: 300 }, () => frame())));
    expect(viz.songClock(a, -3).elapsed).toBe(0);
    expect(viz.songClock(a, 99)).toEqual({ elapsed: 10, total: 10, fraction: 1 });
    const empty = { ...a, songDuration: 0 };
    expect(viz.songClock(empty, 1)).toEqual({ elapsed: 0, total: 0, fraction: 0 });
  });

  it("formatClock writes m:ss, and h:mm:ss from one hour", () => {
    expect(viz.formatClock(0)).toBe("0:00");
    expect(viz.formatClock(65.9)).toBe("1:05");
    expect(viz.formatClock(3599)).toBe("59:59");
    expect(viz.formatClock(3600)).toBe("1:00:00");
    expect(viz.formatClock(-4)).toBe("0:00");
  });
});

describe("line kit (M8 spec §5.2)", () => {
  const spec = Float32Array.from([1, 0.5, 0]);

  it("mirrorBars puts the bass at the left end, or in the middle mirrored out", () => {
    const left = Array.from(viz.mirrorBars(spec, 5, false));
    expect(left[0]).toBeCloseTo(1, 6);
    expect(left[2]).toBeCloseTo(0.5, 6);
    expect(left[4]).toBeCloseTo(0, 6);
    const mid = Array.from(viz.mirrorBars(spec, 5, true));
    expect(mid[2]).toBeCloseTo(1, 6);
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[4]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(mid[3], 6);
    expect(viz.mirrorBars(spec, 1, false)[0]).toBeCloseTo(1, 6);
  });

  it("smoothSpectrum box-blurs without changing the length", () => {
    const out = Array.from(viz.smoothSpectrum(Float32Array.from([0, 0, 3, 0, 0]), 1));
    expect(out).toHaveLength(5);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(1, 6);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(Array.from(viz.smoothSpectrum(spec, 0))).toEqual(Array.from(spec));
  });

  it("scopeLine is silent in silence and repeats for the same song time", () => {
    const quiet = viz.createAudio(fakeAnalysis(Array.from({ length: 300 }, () => frame())));
    expect(Array.from(viz.scopeLine(quiet, 2, 40, 5)).every((v) => v === 0)).toBe(true);
    const loudFrames = Array.from({ length: 300 }, () => frame({ b: new Array(32).fill(0.9) }));
    const whole = viz.createAudio(fakeAnalysis(loudFrames));
    const line = Array.from(viz.scopeLine(whole, 7.2, 40, 5));
    expect(line.some((v) => Math.abs(v) > 0.1)).toBe(true);
    expect(line.every((v) => v >= -1 && v <= 1)).toBe(true);
    const part = viz.createAudio({
      ...fakeAnalysis(loudFrames.slice(0, 120)),
      offset: 1,
      sectionStart: 7,
      songDuration: 10,
    });
    expect(Array.from(viz.scopeLine(part, 0.2, 40, 5))).toEqual(line);
  });
});

describe("lightning (M9 spec §5.5, §5.6)", () => {
  /** How far (x, y) is from the straight line through a and b. */
  function sideways(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy);
  }

  it("lightningPath starts and ends exactly at the given points", () => {
    for (const seed of [1, 42, 9999]) {
      const pts = viz.lightningPath(12.5, -3, 400.25, 210, seed, 5);
      expect(pts[0]).toEqual([12.5, -3]);
      expect(pts[pts.length - 1]).toEqual([400.25, 210]);
    }
  });

  it("has 2^detail + 1 points, detail clamped to 0..8", () => {
    expect(viz.lightningPath(0, 0, 100, 0, 1, 0)).toHaveLength(2);
    expect(viz.lightningPath(0, 0, 100, 0, 1, 1)).toHaveLength(3);
    expect(viz.lightningPath(0, 0, 100, 0, 1, 4)).toHaveLength(17);
    expect(viz.lightningPath(0, 0, 100, 0, 1, 20)).toHaveLength(257);
    expect(viz.lightningPath(0, 0, 100, 0, 1, -3)).toHaveLength(2);
    expect(viz.lightningPath(0, 0, 100, 0, 1, NaN)).toHaveLength(2);
    expect(viz.lightningPath(0, 0, 100, 0, 1, 3.7)).toHaveLength(9);
  });

  it("is the same for the same seed and differs for another", () => {
    const a = viz.lightningPath(0, 0, 300, 100, 77, 6);
    expect(viz.lightningPath(0, 0, 300, 100, 77, 6)).toEqual(a);
    expect(viz.lightningPath(0, 0, 300, 100, 78, 6)).not.toEqual(a);
  });

  it("is jagged, and its sideways offset is bounded by its length", () => {
    const a: [number, number] = [100, 100],
      b: [number, number] = [700, 400];
    const len = Math.hypot(600, 300);
    let biggest = 0;
    for (let seed = 0; seed < 200; seed++) {
      const pts = viz.lightningPath(a[0], a[1], b[0], b[1], seed, 6);
      let most = 0;
      for (const p of pts) most = Math.max(most, sideways(p, a, b));
      expect(most).toBeLessThanOrEqual(0.5 * len);
      biggest = Math.max(biggest, most);
      // it moves steadily from one end to the other (never doubles back along the line)
      const along = pts.map((p) => ((p[0] - a[0]) * 600 + (p[1] - a[1]) * 300) / len);
      for (let i = 1; i < along.length; i++) expect(along[i]).toBeGreaterThan(along[i - 1]);
    }
    expect(biggest).toBeGreaterThan(0.08 * len); // visibly jagged
    // the jag scales with the bolt's length, and can be set
    const short = viz.lightningPath(0, 0, 60, 0, 5, 5);
    const long = viz.lightningPath(0, 0, 600, 0, 5, 5);
    for (let i = 0; i < short.length; i++) expect(long[i][1]).toBeCloseTo(short[i][1] * 10, 6);
    const calm = viz.lightningPath(0, 0, 600, 0, 5, 5, 0.05);
    const wild = viz.lightningPath(0, 0, 600, 0, 5, 5, 0.3);
    const spread = (pts: [number, number][]) => Math.max(...pts.map((p) => Math.abs(p[1])));
    expect(spread(wild)).toBeGreaterThan(spread(calm));
  });

  it("gives finite points for a zero-length bolt or bad numbers", () => {
    const pts = viz.lightningPath(50, 60, 50, 60, 3, 4);
    expect(pts).toHaveLength(17);
    for (const p of pts) expect(p).toEqual([50, 60]);
    for (const p of viz.lightningPath(NaN, 0, 10, Infinity, NaN, 3)) {
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
  });

  it("lightningBranches forks off a path, seeded and bounded", () => {
    const main = viz.lightningPath(960, 0, 960, 600, 11, 6);
    const forks = viz.lightningBranches(main, 11, 3, 4);
    expect(forks).toHaveLength(3);
    expect(viz.lightningBranches(main, 11, 3, 4)).toEqual(forks);
    expect(viz.lightningBranches(main, 12, 3, 4)).not.toEqual(forks);
    const keys = new Set(main.map((p) => p.join(",")));
    for (const fork of forks) {
      expect(fork).toHaveLength(17);
      // each starts on the main path, away from its ends
      expect(keys.has(fork[0].join(","))).toBe(true);
      expect(fork[0]).not.toEqual(main[0]);
      expect(fork[0]).not.toEqual(main[main.length - 1]);
      const reach = Math.hypot(
        fork[fork.length - 1][0] - fork[0][0],
        fork[fork.length - 1][1] - fork[0][1],
      );
      expect(reach).toBeGreaterThan(0.1 * 600);
      expect(reach).toBeLessThanOrEqual(0.5 * 600);
      // heading on the way the bolt goes (down here), not back up
      expect(fork[fork.length - 1][1]).toBeGreaterThan(fork[0][1]);
      for (const p of fork) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
    expect(viz.lightningBranches(main, 11, 0, 4)).toEqual([]);
    expect(viz.lightningBranches([[1, 1]], 11, 2, 4)).toEqual([]);
  });
});
