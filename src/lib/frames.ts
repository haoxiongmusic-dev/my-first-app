/**
 * Comparing still frames, to prove a template reacts to the music: a quiet moment and a loud
 * moment of the sample song must look clearly different (spec §11).
 */

export const GRAY_WIDTH = 192;
export const GRAY_HEIGHT = 108;

/** FFmpeg arguments that shrink an image to 192×108 and save it as raw 8-bit gray pixels. */
export function grayFrameArgs(image: string, out: string): string[] {
  return [
    ...["-y", "-v", "error", "-i", image],
    ...["-vf", `scale=${GRAY_WIDTH}:${GRAY_HEIGHT},format=gray`, "-f", "rawvideo", out],
  ];
}

/** Average brightness of each frame (0–255) and their average pixel difference. */
export function grayStats(
  a: Uint8Array,
  b: Uint8Array,
): { meanA: number; meanB: number; meanAbsDiff: number } {
  if (a.length !== b.length || a.length === 0) throw new Error("Frames must be the same size");
  let sumA = 0;
  let sumB = 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    sumA += a[i];
    sumB += b[i];
    diff += Math.abs(a[i] - b[i]);
  }
  return { meanA: sumA / a.length, meanB: sumB / a.length, meanAbsDiff: diff / a.length };
}
