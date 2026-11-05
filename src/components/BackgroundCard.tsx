"use client";

// Content tab → Background image (optional): an image behind the particles. Choosing one
// switches the template's "Show background" on; Remove switches it off again.
import { useState } from "react";

export type ChosenBackground = { backgroundId: string; name: string };

type Props = {
  background: ChosenBackground | null;
  /** where to fetch a thumbnail of the converted image */
  thumbnailSrc: string | null;
  onBackground: (background: ChosenBackground | null) => void;
  onStatus: (text: string, isError?: boolean) => void;
};

export function BackgroundCard({ background, thumbnailSrc, onBackground, onStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    onStatus("Preparing the background image…");
    try {
      const response = await fetch("/api/backgrounds", {
        method: "PUT",
        headers: { "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const body = (await response.json()) as { backgroundId?: string; error?: string };
      if (response.ok && body.backgroundId) {
        onBackground({ backgroundId: body.backgroundId, name: file.name });
        onStatus("Ready");
      } else {
        onStatus(body.error ?? "The image couldn't be used.", true);
      }
    } catch {
      onStatus("The upload failed. Is the app still running?", true);
    } finally {
      setBusy(false);
    }
  }

  if (!background && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-zinc-700 px-4 py-3 text-left text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        + Add a background image
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">Background image</h3>
      {background && thumbnailSrc && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the preview route */}
          <img src={thumbnailSrc} alt="" className="aspect-video w-full rounded object-cover" />
          <p className="truncate text-xs text-zinc-400" title={background.name}>
            {background.name}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <label
          className={`inline-block cursor-pointer rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400 ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          {background ? "Choose another image" : "Choose an image"}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {background && (
          <button
            type="button"
            onClick={() => onBackground(null)}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">JPG, PNG or WebP · up to 50 MB · fills the frame</p>
    </section>
  );
}
