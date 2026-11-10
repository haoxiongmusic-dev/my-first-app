// Types for viz-toolkit.js, so TypeScript code (tests, scripts) can use it safely.

export type ToolkitAnalysis = {
  version: number;
  fps: number;
  bands: number;
  duration: number;
  frames: { b: number[]; l: number; k: number; f: number }[];
  hits: [number, number][];
  /** seconds of analysis kept before a section's start (0 for a whole song) */
  offset?: number;
  /** for a section: where it starts in the whole song, seconds (0 for a whole song) */
  sectionStart?: number;
  /** for a section: the whole song's length, seconds (duration is the section's) */
  songDuration?: number;
  /** for a section: each Hz beat range's scale over the whole song (see beatScales) */
  beatScales?: Record<string, number>;
  /** for a section: the loudness summed over the frames before the kept analysis (loud-seconds) */
  loudBefore?: number;
};

export type BeatRange = { value: string; label: string; low?: number; high?: number };

export type AudioOptions = {
  beatRange?: string;
  spectrumLow?: number;
  spectrumHigh?: number;
  spectrumBoost?: number;
  spectrumCount?: number;
};

export type AudioSample = {
  bands: Float32Array;
  loud: number;
  kick: number;
  flux: number;
  /** pulse from the chosen beat range: the analyzer's kick for "kick" */
  beat: number;
};

export type ToolkitAudio = {
  fps: number;
  duration: number;
  offset: number;
  /** where time 0 is in the whole song, seconds: song time = t + songStart */
  songStart: number;
  /** the whole song's length in seconds, also in a section */
  songDuration: number;
  sample(t: number): AudioSample;
  spectrum(t: number, out?: Float32Array): Float32Array;
  /** [age in seconds, strength] of up to n hits at or before t, newest first */
  recentHits(t: number, n: number): [number, number][];
};

export type ToolkitProgram = WebGLProgram & { u: Record<string, WebGLUniformLocation | null> };
export type RenderTarget = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };

export interface VizToolkit {
  createProgram(gl: WebGLRenderingContext, vertexSrc: string, fragmentSrc: string): ToolkitProgram;
  createTarget(gl: WebGLRenderingContext, w: number, h: number): RenderTarget;
  drawQuad(gl: WebGLRenderingContext, program: WebGLProgram): void;
  blur(
    gl: WebGLRenderingContext,
    program: ToolkitProgram,
    a: RenderTarget,
    b: RenderTarget,
    scale: number,
  ): void;
  showError(message: string): void;
  declaredDefaults(json: string): Record<string, unknown>;
  trackGl(gl: WebGLRenderingContext): { gl: WebGLRenderingContext; dispose(): void };
  mulberry32(seed: number): () => number;
  hexToRGB(hex: string): [number, number, number];
  bandEdges(): number[];
  bandIndexForHz(hz: number): number;
  BEAT_RANGES: BeatRange[];
  beatTrack(
    frames: ToolkitAnalysis["frames"],
    fps: number,
    firstBand: number,
    lastBand: number,
    scale?: number,
  ): { hits: [number, number][]; pulse: Float32Array };
  beatScales(frames: ToolkitAnalysis["frames"]): Record<string, number>;
  createAudio(data: ToolkitAnalysis, opts?: AudioOptions): ToolkitAudio;
  /** angles (radians, clockwise from the top) spread over an arc centred on the top */
  ringAngles(count: number, arcDeg: number): Float32Array;
  /** [x, y, nx, ny] on a ring of radius 1 (y down) and its outward unit normal */
  ringPoint(angle: number, shape: RingShape): [number, number, number, number];
  /** one value per angle: the bass at the top, mirrored, the last band at the arc ends */
  ringValues(spectrum: ArrayLike<number>, angles: ArrayLike<number>, arcDeg: number): Float32Array;
  /** 0..1: the strongest recent beat, fading with time constant `release` seconds */
  beatEnvelope(audio: ToolkitAudio, t: number, release: number): number;
  /** the Bands setting (10..100 %) as a point count, from a fifth of `full` to all of it */
  bandsToRingCount(pct: number, full: number): number;
  /** song time for timers: elapsed and total seconds of the whole song, and elapsed / total */
  songClock(audio: ToolkitAudio, t: number): { elapsed: number; total: number; fraction: number };
  /** m:ss, or h:mm:ss from one hour */
  formatClock(seconds: number): string;
  /** values for bars along a line: bass at the left end, or in the middle mirrored out */
  mirrorBars(spectrum: ArrayLike<number>, count: number, fromCentre: boolean): Float32Array;
  /** a box-blurred copy (radius in bands), the same length */
  smoothSpectrum(spectrum: ArrayLike<number>, radius: number): Float32Array;
  /** -1..1 spikes for an oscilloscope line, seeded by the song frame; zeros in silence */
  scopeLine(audio: ToolkitAudio, t: number, count: number, seed: number): Float32Array;
  /**
   * a seeded jagged bolt from (x0, y0) to (x1, y1): 2^detail + 1 points (detail 0..8), exactly
   * at both ends, its sideways jag in proportion to its length (`jag`, default 0.22)
   */
  lightningPath(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    seed: number,
    detail: number,
    jag?: number,
  ): [number, number][];
  /** `count` seeded forks off a bolt's points, each a lightningPath 20–45 % of its length */
  lightningBranches(
    points: [number, number][],
    seed: number,
    count: number,
    detail: number,
    jag?: number,
  ): [number, number][][];
}

export type RingShape = "circle" | "rounded";
