"use client";

// Editor preferences, kept in this browser's local storage (a convenience: if it's unavailable,
// the defaults are used). useSyncExternalStore keeps server and browser renders consistent.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { loadPreferences, type Preferences, PREFERENCES_KEY } from "@/lib/editor-state";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PREFERENCES_KEY);
  } catch {
    return null;
  }
}

export function usePreferences(): [Preferences, (change: Partial<Preferences>) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const preferences = useMemo(() => loadPreferences(raw), [raw]);
  const update = useCallback(
    (change: Partial<Preferences>) => {
      try {
        window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...preferences, ...change }));
      } catch {
        // storage unavailable (e.g. a private window): the change lasts until reload
      }
      listeners.forEach((listener) => listener());
    },
    [preferences],
  );
  return [preferences, update];
}
