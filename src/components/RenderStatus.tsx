"use client";

// "Rendering: graphics chip / software (slow)": how this server draws exports, from the
// start-up GPU check (/api/health). Asked again every 10 s while the check is still running;
// shows nothing when no check runs (the owner's PC).
import { useEffect, useState } from "react";

const LABELS: Record<string, string> = {
  checking: "Rendering: checking…",
  hardware: "Rendering: graphics chip",
  software: "Rendering: software (slow)",
  failed: "Rendering: check failed",
};

export function RenderStatus() {
  const [gpu, setGpu] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      try {
        const health = (await (await fetch("/api/health")).json()) as { gpu?: string };
        if (!alive || !health.gpu) return;
        setGpu(health.gpu);
        if (health.gpu === "checking") timer = setTimeout(ask, 10_000);
      } catch {
        // not available (e.g. signed out): show nothing
      }
    };
    void ask();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!gpu || !LABELS[gpu]) return null;
  return (
    <span className={`text-xs ${gpu === "hardware" ? "text-zinc-500" : "text-amber-400"}`}>
      {LABELS[gpu]}
    </span>
  );
}
