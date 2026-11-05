"use client";

// Content tab → one card per image setting the template declares (for example the cover
// art). The setting's value is the uploaded picture's id, or "" for no picture.
import { useState } from "react";
import { imagePreviewUrl, type ImageVariable } from "@/lib/template-values";

type Props = {
  variable: ImageVariable;
  /** an image id, or "" */
  value: string;
  onChange: (id: string) => void;
  onStatus: (text: string, isError?: boolean) => void;
};

export function ImageCard({ variable, value, onChange, onStatus }: Props) {
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    onStatus("Preparing the image…");
    try {
      const response = await fetch(`/api/images?fit=${variable.fit}`, {
        method: "PUT",
        headers: { "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (response.ok && body.id) {
        onChange(body.id);
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

  const thumbnail = imagePreviewUrl(value, variable.fit);
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">{variable.label}</h3>
      <div className="flex items-center gap-3">
        {thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element -- served by the image route */
          <img src={thumbnail} alt="" className="h-20 w-20 rounded object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-zinc-700 text-xs text-zinc-500">
            No image
          </div>
        )}
        <div className="flex flex-col items-start gap-1">
          <label
            className={`inline-block cursor-pointer rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400 ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            Upload
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="sr-only"
              disabled={busy}
              aria-label={`Upload ${variable.label}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">JPG, PNG or WebP · up to 50 MB · cropped to a square</p>
    </section>
  );
}
