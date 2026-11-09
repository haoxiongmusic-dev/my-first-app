// The repo is public: music, video, app data and local settings must never be committed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function isIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", path], { stdio: "ignore" });
    return true; // exit 0: ignored
  } catch {
    return false; // exit 1: not ignored
  }
}

describe(".gitignore keeps private files out of the public repo", () => {
  it.each([
    "song.mp3",
    "analyzer/T-REX.wav",
    "music/a.flac",
    "x.m4a",
    "x.aac",
    "x.ogg",
    "clip.mp4",
    "clip.mov",
    "clip.webm",
    "storage/songs/abc/analysis.json",
    "test-renders/out.mp4",
    "analyzer/.venv/Scripts/python.exe",
    ".claude/settings.local.json",
    ".env",
    "templates/particle-horizon/assets/audio-data.js",
    "templates/particle-horizon/assets/song.wav",
    "templates/particle-horizon/.hyperframes/video-state.json",
    "templates/iron-wraith/assets/audio-data.js",
    "templates/iron-wraith/assets/song.wav",
    "templates/nova-streak/assets/audio-data.js",
    "templates/nova-streak/assets/song.wav",
    "templates/halo-rings/assets/audio-data.js",
    "templates/halo-rings/assets/song.wav",
    "templates/neon-sundown/assets/audio-data.js",
    "templates/neon-sundown/assets/song.wav",
    "templates/prism-heart/assets/audio-data.js",
    "templates/prism-heart/assets/song.wav",
    "templates/sky-pillar/assets/audio-data.js",
    "templates/sky-pillar/assets/song.wav",
    "templates/afterglow/assets/audio-data.js",
    "templates/afterglow/assets/song.wav",
    "templates/red-letter/assets/audio-data.js",
    "templates/red-letter/assets/song.wav",
    "templates/signal-dish/assets/audio-data.js",
    "templates/signal-dish/assets/song.wav",
    "templates/moon-tide/assets/audio-data.js",
    "templates/moon-tide/assets/song.wav",
  ])("ignores %s", (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it.each([
    "src/app/page.tsx",
    ".claude/launch.json",
    "analyzer/bands.py",
    ".env.example",
    "templates/particle-horizon/assets/viz-toolkit.js",
    "templates/particle-horizon/template.json",
  ])("still tracks %s", (path) => {
    expect(isIgnored(path)).toBe(false);
  });
});

describe("the container image keeps private files and secrets out", () => {
  const read = (file: string) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return "";
    }
  };

  it(".dockerignore leaves out git, app data, renders, music and secrets", () => {
    const ignore = read(".dockerignore")
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const entry of [".git", "storage", "test-renders", ".env*", "node_modules", "**/*.wav"]) {
      expect(ignore, entry).toContain(entry);
    }
  });

  it("the Dockerfile copies no .env and bakes in no secrets or accounts", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM ");
    expect(dockerfile).not.toMatch(/COPY\s+\.env/);
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s+[^\n]*(SECRET|ACCOUNTS)/m);
  });
});
