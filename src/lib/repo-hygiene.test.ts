// The repo is public: music, video, app data and local settings must never be committed.
import { execFileSync } from "node:child_process";
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
