// Types for HyperFrames' <hyperframes-player> web component (loaded from /api/hyperframes/player.js).
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export interface HyperframesPlayerElement extends HTMLElement {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  /** Send data to the composition's runtime-data handler for `channel`. */
  setRuntimeData(channel: string, data: unknown): void;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": DetailedHTMLProps<
        HTMLAttributes<HyperframesPlayerElement>,
        HyperframesPlayerElement
      > & { src?: string; controls?: boolean };
    }
  }
}
