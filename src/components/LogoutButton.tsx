"use client";

// "Log out", shown only where logins are switched on (the online version).
import { useEffect, useState } from "react";

export function useLoginEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((s: { loginEnabled?: boolean }) => alive && setEnabled(s.loginEnabled === true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

export async function logOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // A full page load on purpose: it drops everything the editor held for the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export function LogoutLink() {
  const enabled = useLoginEnabled();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={logOut}
      className="absolute right-6 top-6 text-sm text-zinc-400 hover:text-zinc-100"
    >
      Log out
    </button>
  );
}
