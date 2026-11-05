/**
 * The part of the song to export (Content tab → Song → section handles). Safe in the browser.
 */
import { formatClock } from "@/lib/editor-state";

export type Section = { start: number; end: number };

/** A section is at least this long (shorter songs export whole). */
export const MIN_SECTION_SECONDS = 1;

/** Keep 0 ≤ start, end ≤ duration and end − start ≥ 1 s; the handle being moved gives way. */
export function clampSection(s: Section, duration: number, moving: "start" | "end"): Section {
  if (duration <= MIN_SECTION_SECONDS) return { start: 0, end: duration };
  let start = Math.min(Math.max(s.start, 0), duration);
  let end = Math.min(Math.max(s.end, 0), duration);
  if (end - start < MIN_SECTION_SECONDS) {
    if (moving === "start") {
      start = Math.max(0, end - MIN_SECTION_SECONDS);
      end = Math.max(end, start + MIN_SECTION_SECONDS);
    } else {
      end = Math.min(duration, start + MIN_SECTION_SECONDS);
      start = Math.min(start, end - MIN_SECTION_SECONDS);
    }
  }
  return { start, end };
}

/** A pointer position on the strip as seconds into the song (to 0.1 s). */
export function sectionFromPointer(x: number, width: number, duration: number): number {
  const fraction = Math.min(1, Math.max(0, x / Math.max(1, width)));
  return Math.round(fraction * duration * 10) / 10;
}

export function isWholeSong(s: Section, duration: number): boolean {
  return s.start <= 0 && s.end >= duration;
}

/** "Whole song (4:12)" or "3:10 – 3:40 (0:30)" */
export function sectionLabel(s: Section, duration: number): string {
  if (isWholeSong(s, duration)) return `Whole song (${formatClock(duration)})`;
  return `${formatClock(s.start)} – ${formatClock(s.end)} (${formatClock(s.end - s.start)})`;
}
