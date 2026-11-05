/**
 * Small pieces of editor logic, kept out of the React components so they can be tested on
 * their own. Safe to use in the browser.
 */

/** The preview page for a template with a song (or the generated sample song). */
export function previewSrc(templateId: string, songId: string | null): string {
  return `/preview/${templateId}/${songId ?? "sample"}/index.html`;
}

/**
 * Pass values on at most once every `ms` milliseconds, always ending on the newest one. Used
 * while a slider is dragged: the preview gets every change soon, without a flood of messages.
 */
export function latestThrottle<T>(
  send: (value: T) => void,
  ms: number,
): { push(value: T): void; flush(): void } {
  let waiting: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function release() {
    timer = null;
    if (!waiting) return;
    const { value } = waiting;
    waiting = null;
    send(value);
    timer = setTimeout(release, ms);
  }

  return {
    push(value) {
      waiting = { value };
      if (!timer) release();
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (waiting) {
        const { value } = waiting;
        waiting = null;
        send(value);
      }
    },
  };
}

/** Tells whether a reply belongs to the newest request (an older upload can finish later). */
export function songRequestGate(): { begin(): number; isCurrent(token: number): boolean } {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (token) => token === latest,
  };
}

/** 75 → "1:15"; 3725 → "1:02:05" */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Preview resolutions (Preferences): the preview draws at this fraction of 1080p. */
export const PREVIEW_RESOLUTIONS = [
  { label: "360p", scale: 1 / 3 },
  { label: "540p", scale: 0.5 },
  { label: "720p", scale: 2 / 3 },
] as const;

export type PreviewResolution = (typeof PREVIEW_RESOLUTIONS)[number]["label"];

export type Preferences = { previewResolution: PreviewResolution; expandedSidebar: boolean };

export const DEFAULT_PREFERENCES: Preferences = {
  previewResolution: "540p",
  expandedSidebar: false,
};

/** Where the browser keeps the editor preferences (a convenience; nothing breaks without it). */
export const PREFERENCES_KEY = "mvz.preferences";

/** Saved preferences, or the defaults for anything missing or unreadable. */
export function loadPreferences(raw: string | null): Preferences {
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (typeof saved !== "object" || saved === null) return { ...DEFAULT_PREFERENCES };
    const s = saved as Partial<Record<keyof Preferences, unknown>>;
    const resolution = PREVIEW_RESOLUTIONS.find((r) => r.label === s.previewResolution);
    return {
      previewResolution: resolution ? resolution.label : DEFAULT_PREFERENCES.previewResolution,
      expandedSidebar:
        typeof s.expandedSidebar === "boolean"
          ? s.expandedSidebar
          : DEFAULT_PREFERENCES.expandedSidebar,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** The drawing scale for a preview resolution. */
export function previewScale(resolution: PreviewResolution): number {
  return PREVIEW_RESOLUTIONS.find((r) => r.label === resolution)?.scale ?? 0.5;
}
