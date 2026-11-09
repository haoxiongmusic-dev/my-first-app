import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analysis";
import { IMAGE_MISSING_MESSAGE, imagePath } from "@/lib/images";
import {
  JobError,
  prepareJob,
  setSongLength,
  sliceAnalysis,
  withVariableDefaults,
} from "@/lib/jobs";
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
  { id: "cover", type: "image", label: "Cover art", default: "", fit: "square" },
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

describe("sliceAnalysis", () => {
  const frames = Array.from({ length: 300 }, (_, i) => ({ b: [i], l: i, k: 0, f: 0 }));
  const full: Analysis = {
    version: 1,
    fps: 30,
    bands: 1,
    duration: 10,
    frames,
    hits: [
      [1, 0.5],
      [4.5, 1],
      [8, 0.2],
      [9.9, 0.3],
    ],
  };

  it("keeps the section plus 6 s before it", () => {
    const part = sliceAnalysis(full, 7, 9);
    expect(part.duration).toBe(2);
    expect(part.offset).toBeCloseTo(6, 6);
    expect(part.frames[0].l).toBe(30); // 1 s into the song
    expect(part.frames.at(-1)?.l).toBe(270); // 9 s
    expect(part.hits).toEqual([
      [0, 0.5],
      [3.5, 1],
      [7, 0.2],
    ]);
  });

  it("records where the section starts in the whole song, and the song's length", () => {
    expect(sliceAnalysis(full, 7, 9).sectionStart).toBe(7);
    expect(sliceAnalysis(full, 7, 9).songDuration).toBe(10);
    expect(sliceAnalysis(full, 2.5, 5).sectionStart).toBe(2.5);
  });

  it("uses less pre-roll near the start of the song", () => {
    const part = sliceAnalysis(full, 2, 5);
    expect(part.offset).toBeCloseTo(2, 6);
    expect(part.frames[0].l).toBe(0);
    expect(part.duration).toBe(3);
  });
});

describe("prepareJob with a section", () => {
  it("trims the song with short fades and slices the analysis", async () => {
    await writeFile(
      song.analysisPath,
      JSON.stringify({ ...analysis(10), frames: Array(300).fill(analysis(10).frames[0]) }),
    );
    const calls: string[][] = [];
    const run: RunCommand = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return ok;
    };
    // The template's own toolkit works out each beat range's whole-song scale.
    await copyFile(
      path.join(process.cwd(), "templates", "shared", "viz-toolkit.js"),
      path.join(template.dir, "assets", "viz-toolkit.js"),
    );
    const jobDir = path.join(work, "section");
    const job = await prepareJob({
      template,
      song,
      values: {},
      jobDir,
      section: { start: 7, end: 9 },
      run,
    });
    expect(job.duration).toBe(2);
    expect(durations(await readFile(job.indexPath, "utf8"))[0]).toBe("2.000");
    const trim = calls.find((c) => c.includes("-ss"));
    expect(trim).toBeDefined();
    expect(trim?.join(" ")).toContain("-ss 7 -t 2");
    expect(trim?.join(" ")).toContain("afade=t=in");
    expect(trim?.at(-1)).toBe(path.join(jobDir, "assets", "song.wav"));
    const data = await readFile(path.join(jobDir, "assets", "audio-data.js"), "utf8");
    expect(data).toContain('"offset":6');
    expect(data).toMatch(/"beatScales":\{"20-90":[0-9.e-]+,/);
  });

  it("rejects a section outside the song", async () => {
    const run: RunCommand = async () => ok;
    const attempt = prepareJob({
      template,
      song,
      values: {},
      jobDir: path.join(work, "s2"),
      section: { start: 20, end: 30 },
      run,
    });
    await expect(attempt).rejects.toThrow(/inside the song/);
  });
});

describe("images in a job", () => {
  const run: RunCommand = async () => ok;
  const ID = "e".repeat(64);

  /** The raw declared default of a setting in a job's index.html. */
  function declaredDefault(html: string, id: string): unknown {
    const json = /data-composition-variables='([^']*)'/.exec(html)?.[1] ?? "[]";
    const vars = JSON.parse(json.replace(/&#39;/g, "'").replace(/&amp;/g, "&")) as {
      id: string;
      default: unknown;
    }[];
    return vars.find((v) => v.id === id)?.default;
  }

  it("copies an image to assets/images/<id>.jpg and puts that path in the variables", async () => {
    const storageRoot = path.join(work, "storage");
    const stored = imagePath(storageRoot, ID, "square");
    await mkdir(path.dirname(stored), { recursive: true });
    await writeFile(stored, "JPEG cover bytes");
    const jobDir = path.join(work, "jobs", "img");
    const job = await prepareJob({
      template,
      song,
      values: { title: "T", cover: ID },
      jobDir,
      run,
      storageRoot,
    });
    const variables = JSON.parse(await readFile(job.variablesPath, "utf8"));
    expect(variables.cover).toBe("assets/images/cover.jpg");
    const copied = path.join(jobDir, "assets", "images", "cover.jpg");
    expect(await readFile(copied, "utf8")).toBe("JPEG cover bytes");
    expect(declaredDefault(await readFile(job.indexPath, "utf8"), "cover")).toBe(
      "assets/images/cover.jpg",
    );
  });

  it("leaves an empty image empty", async () => {
    const jobDir = path.join(work, "jobs", "noimg");
    const job = await prepareJob({
      template,
      song,
      values: { cover: "" },
      jobDir,
      run,
      storageRoot: path.join(work, "storage"),
    });
    expect(JSON.parse(await readFile(job.variablesPath, "utf8")).cover).toBe("");
    expect(existsSync(path.join(jobDir, "assets", "images"))).toBe(false);
  });

  it("stops with the missing-image message", async () => {
    const options = { template, song, values: { cover: ID }, run };
    await expect(
      prepareJob({ ...options, jobDir: path.join(work, "jobs", "gone"), storageRoot: work }),
    ).rejects.toThrow(IMAGE_MISSING_MESSAGE);
    await expect(
      prepareJob({ ...options, jobDir: path.join(work, "jobs", "noroot") }),
    ).rejects.toThrow(IMAGE_MISSING_MESSAGE);
  });
});
