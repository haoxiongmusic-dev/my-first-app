import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  fontStylesheetUrl,
  injectRuntime,
  parseRange,
  resolvePreviewFile,
  RUNTIME_URL,
} from "@/lib/preview";

const SONG = "a".repeat(64);
let templatesRoot: string;
let storageRoot: string;

beforeEach(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "preview-"));
  templatesRoot = path.join(root, "templates");
  storageRoot = path.join(root, "storage");
  const demo = path.join(templatesRoot, "demo");
  await mkdir(path.join(demo, "assets"), { recursive: true });
  await writeFile(
    path.join(demo, "index.html"),
    '<!doctype html>\n<html><head><meta charset="UTF-8" /></head><body>\n' +
      '<div id="root" data-composition-id="main" data-duration="20"></div>\n' +
      '<audio class="clip" data-song-length data-duration="20" src="assets/song.wav"></audio>\n</body></html>',
  );
  await writeFile(path.join(demo, "template.json"), "{}");
  await writeFile(path.join(demo, "assets", "viz-toolkit.js"), "// toolkit");
  await writeFile(path.join(demo, "assets", "song.wav"), "SAMPLE WAV"); // dev sample: must not be served
  const songDir = path.join(storageRoot, "songs", SONG);
  await mkdir(songDir, { recursive: true });
  await writeFile(path.join(songDir, "song.wav"), "REAL WAV");
  const frame = { b: [0], l: 0, k: 0, f: 0 };
  await writeFile(
    path.join(songDir, "analysis.json"),
    JSON.stringify({ version: 1, fps: 30, bands: 32, duration: 12.5, frames: [frame], hits: [] }),
  );
});

const resolve = (filePath: string[], templateId = "demo", songId = SONG) =>
  resolvePreviewFile({ templatesRoot, storageRoot, templateId, songId, path: filePath });

describe("injectRuntime", () => {
  it("puts the runtime script first in <head>", () => {
    const html = injectRuntime("<html><head><title>x</title></head></html>", RUNTIME_URL);
    expect(html).toBe(
      `<html><head><script src="${RUNTIME_URL}"></script><title>x</title></head></html>`,
    );
  });
});

describe("parseRange", () => {
  it("reads every form", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=100-", 1000)).toEqual({ start: 100, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=5000-", 1000)).toBe("invalid");
    expect(parseRange("bytes=x", 1000)).toBe("invalid");
    expect(parseRange(null, 1000)).toBeNull();
  });
});

describe("resolvePreviewFile", () => {
  it("serves index.html with the song length and the runtime", async () => {
    const file = await resolve(["index.html"]);
    expect(file?.kind).toBe("html");
    if (file?.kind !== "html") return;
    expect(file.body).toContain('data-composition-id="main" data-duration="12.500"');
    expect(file.body).toContain(`<script src="${RUNTIME_URL}"></script>`);
  });

  it("maps song.wav and audio-data.js to the song", async () => {
    const wav = await resolve(["assets", "song.wav"]);
    expect(wav).toEqual({
      kind: "file",
      path: path.join(storageRoot, "songs", SONG, "song.wav"),
      contentType: "audio/wav",
    });
    const data = await resolve(["assets", "audio-data.js"]);
    expect(data?.kind).toBe("script");
    if (data?.kind === "script") expect(data.body).toMatch(/^window\.AUDIO_DATA=\{"version":1/);
    const toolkit = await resolve(["assets", "viz-toolkit.js"]);
    expect(toolkit).toMatchObject({ kind: "file", contentType: "text/javascript; charset=utf-8" });
  });

  it("refuses paths outside the template", async () => {
    for (const bad of [
      ["..", "x"],
      ["%2e%2e", "x"],
      ["assets", "..", "..", "package.json"],
      ["C:", "Windows"],
      ["assets" + String.fromCharCode(92) + ".." + String.fromCharCode(92) + "x"],
      [],
    ]) {
      expect(await resolve(bad)).toBeNull();
    }
  });

  it("refuses unknown templates and song ids", async () => {
    expect(await resolve(["index.html"], "nope")).toBeNull();
    expect(await resolve(["index.html"], "..")).toBeNull();
    expect(await resolve(["index.html"], "demo", "b".repeat(64))).toBeNull();
    expect(await resolve(["index.html"], "demo", "../songs")).toBeNull();
  });
});

describe("preview fonts", () => {
  it("fontStylesheetUrl asks Google Fonts for every family at the weights templates use", () => {
    expect(fontStylesheetUrl([])).toBeNull();
    expect(fontStylesheetUrl(["Montserrat", "Playfair Display"])).toBe(
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400&family=Playfair+Display:wght@300;400&display=block",
    );
  });

  it("the preview page loads the fonts of the template's Font setting", async () => {
    const demo = path.join(templatesRoot, "demo");
    const vars = [
      {
        id: "font",
        type: "enum",
        label: "Font",
        default: "Inter",
        options: [
          { value: "Inter", label: "Inter" },
          { value: "EB Garamond", label: "EB Garamond" },
        ],
      },
    ];
    await writeFile(
      path.join(demo, "index.html"),
      `<!doctype html>
<html data-composition-variables='${JSON.stringify(vars)}'><head></head><body>
` + '<div id="root" data-composition-id="main" data-duration="20"></div></body></html>',
    );
    const file = await resolve(["index.html"]);
    expect(file?.kind).toBe("html");
    if (file?.kind !== "html") return;
    expect(file.body).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400&family=EB+Garamond:wght@300;400&display=block">',
    );
  });

  it("a template without a Font setting gets no font stylesheet", async () => {
    const file = await resolve(["index.html"]);
    if (file?.kind === "html") expect(file.body).not.toContain("fonts.googleapis.com");
  });
});
