import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analysis";
import { JobError, prepareJob, setSongLength, withVariableDefaults } from "@/lib/jobs";
import type { CommandResult, RunCommand } from "@/lib/run-command";
import {
  loadTemplate,
  parseVariables,
  type Template,
  type TemplateVariable,
} from "@/lib/templates";

const VARS: TemplateVariable[] = [
  { id: "title", type: "string", label: "Title", default: "SUNLIGHT" },
  { id: "artist", type: "string", label: "Artist", default: "AXIOM" },
  { id: "intensity", type: "number", label: "Intensity", default: 1, min: 0.2, max: 2 },
  { id: "mainColor", type: "color", label: "Main color", default: "#ff6a12" },
];

function indexHtml(vars: TemplateVariable[] = VARS): string {
  return [
    "<!doctype html>",
    `<html lang="en" data-composition-variables='${JSON.stringify(vars)}'>`,
    "<body>",
    '<div id="root" data-composition-id="main" data-start="0" data-duration="20" data-width="1920">',
    '<div id="titles" class="clip" data-start="0" data-duration="20" data-song-length></div>',
    '<audio id="music" class="clip" data-song-length data-start="0" data-duration="20" src="assets/song.wav"></audio>',
    '<div id="intro" class="clip" data-start="0" data-duration="3"></div>',
    "</div>",
    "</body></html>",
  ].join("\n");
}

function durations(html: string): string[] {
  return [...html.matchAll(/data-duration="([^"]*)"/g)].map((m) => m[1]);
}

function analysis(duration: number): Analysis {
  const frame = { b: new Array(32).fill(0.5), l: 0.5, k: 0, f: 0 };
  return {
    version: 1,
    fps: 30,
    bands: 32,
    duration,
    frames: [frame, frame, frame],
    hits: [[0.1, 1]],
  };
}

const ok: CommandResult = { code: 0, stdout: "", stderr: "" };

let work: string;
let template: Template;
let song: { wavPath: string; analysisPath: string };

beforeEach(async () => {
  work = await mkdtemp(path.join(os.tmpdir(), "jobs-"));
  const dir = path.join(work, "templates", "demo");
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await mkdir(path.join(dir, "presets"));
  await writeFile(path.join(dir, "index.html"), indexHtml());
  await writeFile(
    path.join(dir, "template.json"),
    JSON.stringify({
      name: "Demo",
      description: "d",
      groups: [{ name: "All", fields: VARS.map((v) => v.id) }],
      basic: [],
      content: [],
      presets: [],
    }),
  );
  await writeFile(path.join(dir, "assets", "viz-toolkit.js"), "// toolkit");
  await writeFile(path.join(dir, "assets", "audio-data.js"), "window.AUDIO_DATA={stale:true};");
  await writeFile(path.join(dir, "presets", "ice.jpg"), "jpg");
  template = await loadTemplate(dir);

  await mkdir(path.join(work, "song"));
  song = {
    wavPath: path.join(work, "song", "song.wav"),
    analysisPath: path.join(work, "song", "analysis.json"),
  };
  await writeFile(song.wavPath, "RIFF fake wav");
  await writeFile(song.analysisPath, JSON.stringify(analysis(12.345)));
});

describe("setSongLength", () => {
  it("sets the root and every song-length element", () => {
    const html = setSongLength(indexHtml(), 252.4);
    expect(durations(html)).toEqual(["252.400", "252.400", "252.400", "3"]);
  });

  it("throws when a song-length element has no duration", () => {
    const html = indexHtml().replace(
      'data-song-length data-start="0" data-duration="20"',
      "data-song-length",
    );
    expect(() => setSongLength(html, 10)).toThrow(JobError);
  });
});

describe("withVariableDefaults", () => {
  it("round-trips through parseVariables", () => {
    const html = withVariableDefaults(indexHtml(), { title: `It's "big"`, intensity: 1.5 });
    const vars = parseVariables(html);
    expect(vars.find((v) => v.id === "title")?.default).toBe(`It's "big"`);
    expect(vars.find((v) => v.id === "intensity")?.default).toBe(1.5);
    expect(vars.find((v) => v.id === "artist")?.default).toBe("AXIOM");
  });
});

describe("prepareJob", () => {
  const run: RunCommand = async () => ok;

  it("builds a ready job folder", async () => {
    const jobDir = path.join(work, "jobs", "one");
    const values = { title: "T-REX", artist: "AXIOM", intensity: 1.2, mainColor: "#12b8ff" };
    const job = await prepareJob({ template, song, values, jobDir, run });
    expect(job.duration).toBe(12.345);
    expect(await readFile(path.join(jobDir, "assets", "song.wav"), "utf8")).toBe("RIFF fake wav");
    const data = await readFile(path.join(jobDir, "assets", "audio-data.js"), "utf8");
    expect(data.startsWith("window.AUDIO_DATA=")).toBe(true);
    expect(data).toContain('"duration":12.345');
    expect(data).not.toContain("stale");
    const html = await readFile(job.indexPath, "utf8");
    expect(durations(html)).toEqual(["12.345", "12.345", "12.345", "3"]);
    expect(parseVariables(html).find((v) => v.id === "title")?.default).toBe("T-REX");
    expect(JSON.parse(await readFile(job.variablesPath, "utf8"))).toEqual(values);
    expect(existsSync(path.join(jobDir, "presets"))).toBe(false);
    expect(existsSync(path.join(jobDir, "assets", "viz-toolkit.js"))).toBe(true);
  });

  it("sets a 3600 s duration everywhere", async () => {
    await writeFile(song.analysisPath, JSON.stringify(analysis(3600)));
    const job = await prepareJob({
      template,
      song,
      values: {},
      jobDir: path.join(work, "long"),
      run,
    });
    expect(durations(await readFile(job.indexPath, "utf8"))).toEqual([
      "3600.000",
      "3600.000",
      "3600.000",
      "3",
    ]);
  });

  it("rejects invalid values", async () => {
    const attempt = prepareJob({
      template,
      song,
      values: { mainColor: "red" },
      jobDir: path.join(work, "bad"),
      run,
    });
    await expect(attempt).rejects.toThrow(JobError);
    await expect(attempt).rejects.toThrow(/mainColor/);
  });

  it("converts the background image", async () => {
    const calls: string[][] = [];
    const recording: RunCommand = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return ok;
    };
    const backgroundPath = path.join(work, "photo.png");
    await prepareJob({
      template,
      song,
      values: {},
      jobDir: path.join(work, "bg"),
      backgroundPath,
      run: recording,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("ffmpeg");
    expect(calls[0]).toContain(backgroundPath);
    expect(calls[0]).toContain("-frames:v");
    expect(calls[0].at(-1)).toBe(path.join(work, "bg", "assets", "background.jpg"));
  });

  it("reports an unreadable image", async () => {
    const failing: RunCommand = async () => ({ code: 1, stdout: "", stderr: "Invalid data" });
    const attempt = prepareJob({
      template,
      song,
      values: {},
      jobDir: path.join(work, "bg2"),
      backgroundPath: path.join(work, "notes.txt"),
      run: failing,
    });
    await expect(attempt).rejects.toThrow("Couldn't read this image. Try JPG or PNG.");
  });
});
