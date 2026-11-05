"use client";

// The live preview: HyperFrames' player showing the template for the chosen song. Settings are
// sent into the running preview (runtime data), so changes show at once without a reload.
import { useEffect, useRef, useState } from "react";
import { latestThrottle } from "@/lib/editor-state";
import type { TemplateValues } from "@/lib/template-values";
import type { HyperframesPlayerElement } from "./hyperframes-player";

const PLAYER_SCRIPT = "/api/hyperframes/player.js";
let playerScript: Promise<void> | null = null;

/** Load the player's script once per page; it defines the <hyperframes-player> element. */
function loadPlayerScript(): Promise<void> {
  if (customElements.get("hyperframes-player")) return Promise.resolve();
  playerScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAYER_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => {
      playerScript = null;
      reject(new Error("The preview player didn't load. Is the app still running?"));
    };
    document.head.appendChild(script);
  });
  return playerScript;
}

type Props = {
  src: string;
  values: TemplateValues;
  /** preview resolution as a fraction of 1080p */
  scale: number;
  onError: (message: string) => void;
};

export function PreviewPlayer({ src, values, scale, onError }: Props) {
  const ref = useRef<HyperframesPlayerElement>(null);
  const ready = useRef(false);
  const latest = useRef({ values, scale });
  const sender = useRef<ReturnType<typeof latestThrottle<TemplateValues>> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    latest.current = { values, scale };
  }, [values, scale]);

  useEffect(() => {
    loadPlayerScript().then(
      () => setLoaded(true),
      (error: Error) => onError(error.message),
    );
  }, [onError]);

  // Listen to the player once it exists; send the current settings whenever it (re)loads.
  useEffect(() => {
    const player = ref.current;
    if (!loaded || !player) return;
    sender.current = latestThrottle<TemplateValues>(
      (v) => player.setRuntimeData("settings", v),
      100,
    );
    const onReady = () => {
      ready.current = true;
      player.setRuntimeData("preview", { scale: latest.current.scale });
      player.setRuntimeData("settings", latest.current.values);
    };
    const onFail = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      onError(detail?.message ?? "The preview couldn't play.");
    };
    player.addEventListener("ready", onReady);
    player.addEventListener("error", onFail);
    player.addEventListener("playbackerror", onFail);
    return () => {
      player.removeEventListener("ready", onReady);
      player.removeEventListener("error", onFail);
      player.removeEventListener("playbackerror", onFail);
      sender.current?.flush();
    };
  }, [loaded, onError]);

  // A new song means a new page in the player: wait for its "ready" before sending again.
  useEffect(() => {
    ready.current = false;
  }, [src]);

  useEffect(() => {
    if (ready.current) sender.current?.push(values);
  }, [values]);

  useEffect(() => {
    if (ready.current) ref.current?.setRuntimeData("preview", { scale });
  }, [scale]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">
      {loaded && (
        <hyperframes-player
          ref={ref}
          src={src}
          controls
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
