"use client";

// Preferences: how the editor behaves (not how the video looks).
import { type Preferences, PREVIEW_RESOLUTIONS } from "@/lib/editor-state";

type Props = { preferences: Preferences; onChange: (change: Partial<Preferences>) => void };

export function PreferencesPanel({ preferences, onChange }: Props) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Preview resolution</h3>
        <p className="text-xs text-zinc-500">
          Lower is smoother on a slower computer. Exports always use full quality.
        </p>
        <div role="radiogroup" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {PREVIEW_RESOLUTIONS.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={preferences.previewResolution === r.label}
              onClick={() => onChange({ previewResolution: r.label })}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                preferences.previewResolution === r.label
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Wide settings panel</h3>
          <p className="text-xs text-zinc-500">More room for the settings, less for the preview.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Wide settings panel"
          aria-checked={preferences.expandedSidebar}
          onClick={() => onChange({ expandedSidebar: !preferences.expandedSidebar })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${preferences.expandedSidebar ? "bg-amber-500" : "bg-zinc-700"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${preferences.expandedSidebar ? "left-5" : "left-0.5"}`}
          />
        </button>
      </section>
    </div>
  );
}
