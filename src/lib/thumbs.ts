/**
 * Preset thumbnails are snapshots of a short section of a song. A template's title fades in
 * over its first 1.9 s and the picture fades out over its last 2.5 s, so the section is 6 s
 * long with the moment 3 s in: after the title is fully in and before the fade-out starts.
 */
const SECTION_LENGTH = 6;

export function thumbSection(
  at: number,
  songDuration: number,
): { start: number; end: number; local: number } {
  const start = Math.min(
    Math.max(0, at - SECTION_LENGTH / 2),
    Math.max(0, songDuration - SECTION_LENGTH),
  );
  const end = Math.min(songDuration, start + SECTION_LENGTH);
  return { start, end, local: at - start };
}
