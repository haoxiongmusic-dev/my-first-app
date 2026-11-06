"use client";

// The login form: username and password, posted to /api/auth/login; on success, on to the
// page the visitor first asked for.
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, next }),
      });
      const body = (await response.json()) as { next?: string; error?: string };
      if (response.ok && body.next) {
        window.location.assign(body.next);
        return;
      }
      setError(body.error ?? "Wrong username or password.");
    } catch {
      setError("The server didn't answer. Is it still running?");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3 text-left">
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Username
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-2 rounded-md bg-amber-500 px-4 py-2 font-medium text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
