"use client";

// The Presets panel (spec §4.1): each preset of the template as a thumbnail card. Picking one
// sets the template's look in one go; the card that matches the current look is highlighted.
import type { TemplatePreset } from "@/lib/template-values";

type Props = {
  templateId: string;
  presets: TemplatePreset[];
  isActive: (preset: TemplatePreset) => boolean;
  onApply: (preset: TemplatePreset) => void;
};

export function PresetsPanel({ templateId, presets, isActive, onApply }: Props) {
  if (presets.length === 0) {
    return <p className="text-sm text-zinc-400">This template has no presets.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {presets.map((preset) => {
        const active = isActive(preset);
        return (
          <button
            key={preset.name}
            type="button"
            aria-pressed={active}
            onClick={() => onApply(preset)}
            className={`overflow-hidden rounded-lg border bg-zinc-900 text-left ${
              active ? "border-amber-500" : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            {preset.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by the preview route
              <img
                src={`/preview/${templateId}/sample/${preset.thumbnail}`}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="aspect-video w-full bg-zinc-800" />
            )}
            <span
              className={`block px-2 py-1.5 text-sm ${active ? "text-amber-400" : "text-zinc-200"}`}
            >
              {preset.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
