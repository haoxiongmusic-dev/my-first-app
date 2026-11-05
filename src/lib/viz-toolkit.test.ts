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
