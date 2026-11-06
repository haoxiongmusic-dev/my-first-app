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
  /** for a section: each Hz beat range's scale over the whole song (see beatScales) */
  beatScales?: Record<string, number>;
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
}

export type RingShape = "circle" | "rounded";
