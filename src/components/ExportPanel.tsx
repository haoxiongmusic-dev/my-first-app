"use client";

// The Export panel (spec §4 Export): a summary and choices, then progress with Cancel, then
// Download. Exports run on the server one at a time; this panel only starts and watches them,
// so closing it (or reloading the page) doesn't stop an export.
import { useCallback, useEffect, useRef, useState } from "react";
import { exportSummary, progressText, shouldNotify } from "@/lib/export-client";
import type { ExportStatus } from "@/lib/exports/manager";
import type { Quality, Resolution } from "@/lib/exports/progress";
import { isWholeSong, type Section, sectionLabel } from "@/lib/section";
import type { TemplateValues } from "@/lib/template-values";
import type { ChosenSong } from "./SongCard";

type Props = {
  open: boolean;
  onClose: () => void;
  templateId: string;
  song: ChosenSong | null;
  section: Section | null;
  values: TemplateValues;
  backgroundId: string | null;
  /** short progress text for the top bar while an export runs ("" when none) */
  onProgress: (text: string) => void;
};

/** A failed export from the last day (e.g. cut off by a restart) is shown when the panel opens. */
function isRecentFailure(s: ExportStatus): boolean {
  return s.state === "failed" && Date.now() - Date.parse(s.startedAt) < 24 * 3600 * 1000;
}

const LOW_DISK_TEXT = "Less than 5 GB of disk space is free. A long export may not fit.";

function choiceClass(active: boolean) {
  return `flex-1 rounded-md px-3 py-1.5 text-sm ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`;
}

export function ExportPanel(props: Props) {
  const { open, onClose, song, section, onProgress } = props;
  const [quality, setQuality] = useState<Quality>("final");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [notify, setNotify] = useState(false);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [lowDisk, setLowDisk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<ExportStatus | null>(null);
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const show = useCallback(
    (next: ExportStatus | null) => {
      if (next && shouldNotify(previous.current, next) && notifyRef.current) {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(next.state === "done" ? "Your video is ready" : "The export failed", {
            body: next.state === "done" ? (next.fileName ?? "") : (next.error ?? ""),
          });
        }
      }
      previous.current = next;
      setStatus(next);
      onProgress(next?.state === "running" ? `Exporting ${Math.floor(next.percent)} %` : "");
    },
    [onProgress],
  );

  // On load: is an export already running (another tab, or before a reload)? And disk space.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/exports")
      .then((r) => r.json())
      .then(
        (body: { current: ExportStatus | null; latest: ExportStatus | null; lowDisk: boolean }) => {
          if (cancelled) return;
          setLowDisk(body.lowDisk);
          if (body.current) show(body.current);
          else if (body.latest && isRecentFailure(body.latest)) show(body.latest);
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [show]);

  // While an export runs, check on it every second.
  const runningId = status?.state === "running" ? status.exportId : null;
  useEffect(() => {
    if (!runningId) return;
    const timer = setInterval(() => {
      fetch(`/api/exports/${runningId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((next: ExportStatus | null) => next && show(next))
        .catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [runningId, show]);

  async function start() {
    if (!song || !section) return;
    setError(null);
    const whole = isWholeSong(section, song.duration);
    const response = await fetch("/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId: props.templateId,
        songId: song.songId,
        values: props.values,
        start: whole ? undefined : section.start,
        end: whole ? undefined : section.end,
        quality,
        resolution,
        backgroundId: props.backgroundId ?? undefined,
      }),
    }).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as ExportStatus & { error?: string })
      : null;
    if (response?.status === 202 && body) show(body);
    else setError(body?.error ?? "The export couldn't start. Is the app still running?");
  }

  async function cancel() {
    if (!status || !window.confirm("Cancel this export?")) return;
    const response = await fetch(`/api/exports/${status.exportId}`, { method: "DELETE" });
    if (response.ok) show((await response.json()) as ExportStatus);
  }

  async function toggleNotify(checked: boolean) {
    setNotify(checked);
    if (checked && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  if (!open) return null;
  const running = status?.state === "running";
  const seconds = song && section ? section.end - section.start : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export"
    >
      <div className="w-full max-w-md space-y-5 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        {!song || !section ? (
          <p className="text-sm text-zinc-400">
            Upload a song on the Content tab first: the sample song is for previews only.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-300">
              {exportSummary({ seconds, resolution, quality })}
            </p>
            {seconds > 600 && !running && (
              <p className="text-sm font-semibold text-amber-400">
                This is a long export. Keep the PC awake until it finishes.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              Part of the song: {sectionLabel(section, song.duration)} (change it on the Content
              tab)
            </p>

            {!running && status?.state !== "done" && (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-300">Quality</p>
                  <div role="radiogroup" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
                    {(["draft", "final"] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        role="radio"
                        aria-checked={quality === q}
                        className={choiceClass(quality === q)}
                        onClick={() => setQuality(q)}
                      >
                        {q === "draft" ? "Draft (quick 720p check)" : "Final"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-zinc-300">Resolution</p>
                  <div role="radiogroup" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
                    {(["1080p", "1440p"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={resolution === r}
                        disabled={quality === "draft"}
                        className={`${choiceClass(resolution === r)} disabled:opacity-40`}
                        onClick={() => setResolution(r)}
                      >
                        {r === "1440p" ? "1440p (upscaled)" : "1080p"}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => void toggleNotify(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Notify me when it&apos;s done
                </label>
                {lowDisk && <p className="text-sm text-amber-400">{LOW_DISK_TEXT}</p>}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="button"
                  onClick={() => void start()}
                  className="w-full rounded-md bg-amber-500 py-2 font-medium text-black hover:bg-amber-400"
                >
                  Start
                </button>
              </>
            )}
          </>
        )}

        {status && (running || status.state !== "running") && (
          <div className="space-y-3">
            {running && (
              <div className="h-2 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${status.percent}%` }}
                />
              </div>
            )}
            <p
              role="status"
              className={`text-sm ${status.state === "failed" ? "text-red-400" : "text-zinc-300"}`}
            >
              {progressText(status)}
            </p>
            {running && (
              <button
                type="button"
                onClick={() => void cancel()}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-500 hover:text-red-400"
              >
                Cancel
              </button>
            )}
            {status.state === "done" && status.fileName && (
              <div className="space-y-2">
                <a
                  href={`/api/exports/${status.exportId}/file`}
                  className="block w-full rounded-md bg-amber-500 py-2 text-center font-medium text-black hover:bg-amber-400"
                >
                  Download
                </a>
                <p className="break-all text-xs text-zinc-500">
                  Saved in storage/exports/{status.fileName}
                </p>
                <button
                  type="button"
                  onClick={() => show(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-100"
                >
                  Export again
                </button>
              </div>
            )}
            {status.state === "failed" && status.logTail.length > 0 && (
              <details className="rounded border border-zinc-800 p-2 text-xs text-zinc-400">
                <summary className="cursor-pointer">What the renderer said</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
                  {status.logTail.join("\n")}
                </pre>
              </details>
            )}
            {(status.state === "failed" || status.state === "cancelled") && (
              <button
                type="button"
                onClick={() => show(null)}
                className="text-xs text-zinc-400 hover:text-zinc-100"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
