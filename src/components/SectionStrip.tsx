"use client";

// The song's waveform with two handles marking the part to export (spec §4: Section).
// Drag a handle, or focus it and use the arrow keys (Shift = 10 s steps).
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { formatClock } from "@/lib/editor-state";
import {
  clampSection,
  isWholeSong,
  type Section,
  sectionFromPointer,
  sectionLabel,
} from "@/lib/section";

type Props = {
  peaks: number[];
  duration: number;
  section: Section;
  onChange: (section: Section) => void;
};

function Waveform({ peaks }: { peaks: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#f59e0b";
    const bar = c.width / Math.max(1, peaks.length);
    peaks.forEach((peak, i) => {
      const h = Math.max(1, peak * c.height * 0.9);
      ctx.fillRect(i * bar, (c.height - h) / 2, Math.max(1, bar - 0.5), h);
    });
  }, [peaks]);
  return <canvas ref={canvas} width={800} height={80} className="h-14 w-full" />;
}

export function SectionStrip({ peaks, duration, section, onChange }: Props) {
  const percent = (seconds: number) => `${(seconds / Math.max(duration, 0.001)) * 100}%`;

  function move(which: "start" | "end", seconds: number) {
    onChange(clampSection({ ...section, [which]: seconds }, duration, which));
  }

  function handleProps(which: "start" | "end") {
    const value = section[which];
    return {
      role: "slider",
      tabIndex: 0,
      "aria-label": which === "start" ? "Section start" : "Section end",
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(duration),
      "aria-valuenow": Math.round(value),
      "aria-valuetext": formatClock(value),
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const stripEl = event.currentTarget.parentElement; // the waveform strip
        if (!event.currentTarget.hasPointerCapture(event.pointerId) || !stripEl) return;
        const rect = stripEl.getBoundingClientRect();
        move(which, sectionFromPointer(event.clientX - rect.left, rect.width, duration));
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const step = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft") move(which, value - step);
        else if (event.key === "ArrowRight") move(which, value + step);
        else return;
        event.preventDefault();
      },
      style: { left: percent(value) },
      className:
        "absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-ew-resize rounded bg-zinc-100 shadow focus:outline-none focus:ring-2 focus:ring-amber-400",
    } as const;
  }

  return (
    <div className="space-y-1">
      <div className="relative h-14 select-none touch-none overflow-visible rounded bg-zinc-950">
        <Waveform peaks={peaks} />
        <div
          className="absolute inset-y-0 left-0 bg-black/60"
          style={{ width: percent(section.start) }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/60"
          style={{ width: `calc(100% - ${percent(section.end)})` }}
        />
        <div {...handleProps("start")} />
        <div {...handleProps("end")} />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Export: {sectionLabel(section, duration)}</span>
        {!isWholeSong(section, duration) && (
          <button
            type="button"
            onClick={() => onChange({ start: 0, end: duration })}
            className="text-zinc-500 hover:text-amber-400"
          >
            Whole song
          </button>
        )}
      </div>
    </div>
  );
}
