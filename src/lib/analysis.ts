/**
 * The analysis the Python analyzer writes for each song (spec §7), and the script form
 * templates read it in (`assets/audio-data.js`).
 */

/** Must match ANALYSIS_VERSION in analyzer/analyze.py (a test checks this). */
export const ANALYSIS_VERSION = 1;

export type AnalysisFrame = {
  /** 32 band levels, deep bass to treble, 0..1 */
  b: number[];
  /** loudness 0..1 */
  l: number;
  /** kick envelope 0..1 */
  k: number;
  /** flux (how much the sound just rose) 0..1 */
  f: number;
};

export type Analysis = {
  version: number;
  fps: number;
  bands: number;
  /** seconds */
  duration: number;
  frames: AnalysisFrame[];
  /** [time in seconds, strength 0..1] */
  hits: [number, number][];
  /** for a section of a song: seconds of analysis kept before the section's start */
  offset?: number;
  /** for a section of a song: where it starts in the whole song, seconds */
  sectionStart?: number;
  /** for a section of a song: the whole song's length, seconds */
  songDuration?: number;
  /** for a section of a song: each Hz beat range's scale over the whole song */
  beatScales?: Record<string, number>;
};

/** True for an analysis written by the current analyzer version. */
export function isCurrentAnalysis(value: unknown): value is Analysis {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<Analysis>;
  return (
    a.version === ANALYSIS_VERSION &&
    typeof a.duration === "number" &&
    Array.isArray(a.frames) &&
    Array.isArray(a.hits)
  );
}

/** The analysis as a script that sets `window.AUDIO_DATA`, for a template's assets folder. */
export function toAudioDataJs(analysis: Analysis): string {
  return `window.AUDIO_DATA=${JSON.stringify(analysis)};`;
}
