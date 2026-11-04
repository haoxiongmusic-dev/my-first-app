import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANALYSIS_VERSION } from "@/lib/analysis";
import type { CommandResult, RunCommand } from "@/lib/run-command";
import { prepareSong, SongError, songIdFor } from "@/lib/songs";

const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const PROJECT = "C:\\dev\\AppProject";
const VENV_PY = "C:\\dev\\AppProject\\analyzer\\.venv\\Scripts\\python.exe";

const analysisJson = (version = ANALYSIS_VERSION) =>
  JSON.stringify({ version, fps: 30, bands: 32, duration: 12.5, frames: [], hits: [] });

type Call = { cmd: string; args: string[] };

/** A stand-in for FFmpeg and the analyzer that writes the files the real ones would. */
function fakeRun(overrides: { ffmpeg?: CommandResult; python?: CommandResult } = {}) {
  const calls: Call[] = [];
  const run: RunCommand = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "ffmpeg") {
      const result = overrides.ffmpeg ?? { code: 0, stdout: "", stderr: "" };
      if (result.code === 0) writeFileSync(args[args.length - 1], "RIFF fake wav");
      else writeFileSync(args[args.length - 1], "half-written"); // FFmpeg can leave a partial file
      return result;
    }
    const result = overrides.python ?? { code: 0, stdout: "", stderr: "" };
    const out = args[args.indexOf("--out") + 1];
    if (result.code === 0) writeFileSync(out, analysisJson());
    return result;
  };
  return { run, calls };
}

let tmp: string;
let source: string;
let storageRoot: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "songs-test-"));
  source = path.join(tmp, "My Sóng.mp3");
  writeFileSync(source, "hello");
  storageRoot = path.join(tmp, "storage");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const options = (run: RunCommand) => ({
  sourcePath: source,
  storageRoot,
  projectRoot: PROJECT,
  platform: "win32" as const,
  run,
});

const songDir = () => path.join(storageRoot, "songs", HELLO_SHA256);
const tempFiles = () => readdirSync(songDir()).filter((name) => name.includes(".tmp."));

async function rejection(promise: Promise<unknown>): Promise<SongError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SongError);
    return error as SongError;
  }
  throw new Error("expected prepareSong to reject");
}

describe("songIdFor", () => {
  it("is the SHA-256 of the file's bytes", async () => {
    expect(await songIdFor(source)).toBe(HELLO_SHA256);
  });
});

describe("prepareSong", () => {
  it("converts then analyzes a new song", async () => {
    const { run, calls } = fakeRun();
    const song = await prepareSong(options(run));

    expect(song).toMatchObject({ songId: HELLO_SHA256, cached: false, duration: 12.5 });
    expect(song.dir).toBe(songDir());
    expect(song.wavPath).toBe(path.join(songDir(), "song.wav"));
    expect(song.analysisPath).toBe(path.join(songDir(), "analysis.json"));

    expect(calls).toHaveLength(2);
    const [ffmpeg, python] = calls;
    expect(ffmpeg.cmd).toBe("ffmpeg");
    expect(ffmpeg.args.slice(0, -1)).toEqual([
      "-y",
      "-v",
      "error",
      "-i",
      source,
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
    ]);
    expect(ffmpeg.args.at(-1)).toMatch(/song\.[0-9a-f-]+\.tmp\.wav$/);
    expect(python.cmd).toBe(VENV_PY);
    expect(python.args.slice(0, 3)).toEqual([
      path.join(PROJECT, "analyzer", "analyze.py"),
      song.wavPath,
      "--out",
    ]);
    expect(python.args[3]).toMatch(/analysis\.[0-9a-f-]+\.tmp\.json$/);

    expect(existsSync(song.wavPath)).toBe(true);
    expect(existsSync(song.analysisPath)).toBe(true);
    expect(tempFiles()).toEqual([]);
  });

  it("reuses a cached song without running anything", async () => {
    await prepareSong(options(fakeRun().run));
    const { run, calls } = fakeRun();
    const song = await prepareSong(options(run));
    expect(song.cached).toBe(true);
    expect(song.duration).toBe(12.5);
    expect(calls).toHaveLength(0);
  });

  it("re-analyzes when the cached analysis has a stale version", async () => {
    await prepareSong(options(fakeRun().run));
    writeFileSync(path.join(songDir(), "analysis.json"), analysisJson(0));
    const { run, calls } = fakeRun();
    const song = await prepareSong(options(run));
    expect(song.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("re-analyzes when the cached analysis.json is corrupt", async () => {
    await prepareSong(options(fakeRun().run));
    writeFileSync(path.join(songDir(), "analysis.json"), '{"version":1,"fra');
    const { run, calls } = fakeRun();
    const song = await prepareSong(options(run));
    expect(song.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("reports an unreadable source and caches nothing", async () => {
    const { run } = fakeRun({ ffmpeg: { code: 1, stdout: "", stderr: "Invalid data found" } });
    const error = await rejection(prepareSong(options(run)));
    expect(error.kind).toBe("unreadable");
    expect(error.message).toBe("Couldn't read this audio file. Try WAV or MP3.");
    expect(existsSync(path.join(songDir(), "analysis.json"))).toBe(false);
    expect(existsSync(path.join(songDir(), "song.wav"))).toBe(false);
    expect(tempFiles()).toEqual([]);
  });

  it("reports a converted file with no audio in it as unreadable", async () => {
    // e.g. an interrupted recording: FFmpeg converts it, but there are no samples to analyze
    const stderr = "Couldn't read this audio file. Try WAV or MP3.\nno audio found\n";
    const { run } = fakeRun({ python: { code: 2, stdout: "", stderr } });
    const error = await rejection(prepareSong(options(run)));
    expect(error.kind).toBe("unreadable");
    expect(error.message).toBe("Couldn't read this audio file. Try WAV or MP3.");
    expect(existsSync(path.join(songDir(), "analysis.json"))).toBe(false);
  });

  it("reports a missing source file", async () => {
    const { run, calls } = fakeRun();
    const error = await rejection(
      prepareSong({ ...options(run), sourcePath: path.join(tmp, "nope.wav") }),
    );
    expect(error.kind).toBe("unreadable");
    expect(error.message).toContain("Couldn't find this file");
    expect(calls).toHaveLength(0);
  });

  it("reports a song that is too short", async () => {
    const stderr = "Song is too short: it needs to be at least 1 second long.\n";
    const { run } = fakeRun({ python: { code: 3, stdout: "", stderr } });
    const error = await rejection(prepareSong(options(run)));
    expect(error.kind).toBe("too-short");
    expect(error.message).toBe("Song is too short: it needs to be at least 1 second long.");
    expect(existsSync(path.join(songDir(), "analysis.json"))).toBe(false);
  });

  it("reports an analyzer crash with its last error line", async () => {
    const stderr = "Traceback (most recent call last):\n  ...\nValueError: boom\n";
    const { run } = fakeRun({ python: { code: 1, stdout: "", stderr } });
    const error = await rejection(prepareSong(options(run)));
    expect(error.kind).toBe("analyzer-failed");
    expect(error.message).toBe("Analysis failed: ValueError: boom");
    expect(existsSync(path.join(songDir(), "analysis.json"))).toBe(false);
    expect(tempFiles()).toEqual([]);
  });
});
