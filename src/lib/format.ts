/**
 * Turn a length in seconds into the text shown to people:
 * "4:12" under an hour, "1:02:05" from one hour up (album-length songs).
 * Fractions are dropped; negative, NaN or infinite values show as "0:00".
 */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  }
  return `${minutes}:${secs}`;
}
