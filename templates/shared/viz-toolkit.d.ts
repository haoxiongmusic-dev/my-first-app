// Types for viz-toolkit.js, so TypeScript code (tests, scripts) can use it safely.

export type ToolkitAnalysis = {
  version: number;
  fps: number;
  bands: number;
  duration: number;
  frames: { b: number[]; l: number; k: number; f: number }[];
  hits: [number, number][];
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
  sample(t: number): AudioSample;
  spectrum(t: number, out?: Float32Array): Float32Array;
  /** [age in seconds, strength] of up to n hits at or before t, newest first */
  recentHits(t: number, n: number): [number, number][];
};

export interface VizToolkit {
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
  ): { hits: [number, number][]; pulse: Float32Array };
  createAudio(data: ToolkitAnalysis, opts?: AudioOptions): ToolkitAudio;
}
