/**
 * FFmpeg settings for finished videos (spec §9). HyperFrames' own output is large; the final
 * encode makes a sensible-size file, and a phone copy fits the 30 MB limit for sending files
 * to the owner's phone.
 */

/** H.264 CRF 20, AAC 320 kb/s, playable while still downloading (+faststart). */
export function finalEncodeArgs(input: string, output: string): string[] {
  return [
    ...["-y", "-v", "error", "-i", input],
    ...["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p"],
    ...["-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart"],
    output,
  ];
}

/** Video bitrate (kb/s) that keeps a phone copy of this length near 26 MB, within 300–4000. */
export function phoneVideoKbps(seconds: number): number {
  return Math.max(300, Math.min(4000, Math.floor((26 * 8 * 1000) / seconds) - 128));
}

/** A 720p copy for the phone, sized to stay under 30 MB for songs up to about 10 minutes. */
export function phoneCopyArgs(input: string, output: string, seconds: number): string[] {
  const kbps = phoneVideoKbps(seconds);
  return [
    ...["-y", "-v", "error", "-i", input, "-vf", "scale=-2:720"],
    ...["-c:v", "libx264", "-preset", "medium", "-b:v", `${kbps}k`],
    ...[
      "-maxrate",
      `${Math.round(kbps * 1.5)}k`,
      "-bufsize",
      `${kbps * 2}k`,
      "-pix_fmt",
      "yuv420p",
    ],
    ...["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
    output,
  ];
}
