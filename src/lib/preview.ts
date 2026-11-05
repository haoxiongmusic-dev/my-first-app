/**
 * The live preview serves a template "virtually" for one song (spec §8):
 *   /preview/<templateId>/<songId>/index.html          the template, song length set, runtime added
 *   /preview/<templateId>/<songId>/assets/song.wav     the song (storage/songs/<id>/song.wav)
 *   /preview/<templateId>/<songId>/assets/audio-data.js  the song's analysis
 *   /preview/<templateId>/<songId>/<anything else>     the template's own files
 * Nothing is copied, so previewing an hour-long album costs no disk space.
 * `songId` "sample" stands for the generated sample song.
 */
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isCurrentAnalysis, toAudioDataJs } from "@/lib/analysis";
import { setSongLength } from "@/lib/jobs";
import { parseVariables } from "@/lib/templates";

export type PreviewFile =
  | { kind: "html"; body: string }
  | { kind: "script"; body: string }
  | { kind: "file"; path: string; contentType: string };

/** Where the app serves HyperFrames' runtime (the player does not add it to a page link). */
export const RUNTIME_URL = "/api/hyperframes/runtime.js";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SONG_ID = /^[0-9a-f]{64}$/;

/**
 * Google Fonts stylesheet for the given families, at the weights templates use for titles
 * (300 and 400). Renders get the same fonts bundled by HyperFrames; the live preview (a plain
 * browser page) has to load them itself, or a Font change would show nothing.
 */
export function fontStylesheetUrl(families: string[]): string | null {
  if (families.length === 0) return null;
  const params = families.map((f) => `family=${f.replace(/ /g, "+")}:wght@300;400`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=block`;
}

/** The families a template offers in its Font setting (an enum variable with id "font"). */
function templateFontFamilies(html: string): string[] {
  try {
    const font = parseVariables(html).find((v) => v.id === "font");
    return font?.type === "enum" ? font.options.map((o) => o.value) : [];
  } catch {
    return []; // no settings declared: nothing to load
  }
}

/** Add the HyperFrames runtime as the first script in <head>. */
export function injectRuntime(html: string, runtimeUrl: string): string {
  const tag = `<script src="${runtimeUrl}"></script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length)
    );
  return tag + html;
}

/**
 * The byte range a browser asked for (so audio can seek without downloading the whole song).
 * null = no Range header (send everything); "invalid" = answer 416.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2])); // the last n bytes
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start >= size || start > end ? "invalid" : { start, end };
}

/** Decode and check one URL path segment; null if it could step outside its folder. */
function safeSegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (decoded === "" || decoded === "." || decoded === "..") return null;
  if (/[\\/:\0]/.test(decoded)) return null;
  return decoded;
}

export type ResolvePreviewOptions = {
  templatesRoot: string;
  storageRoot: string;
  templateId: string;
  songId: string;
  path: string[];
  /** the fingerprint of the generated sample song (made on demand), for songId "sample" */
  resolveSample?: () => Promise<string | null>;
};

/** What to send for one preview URL, or null for "not found". */
export async function resolvePreviewFile(opts: ResolvePreviewOptions): Promise<PreviewFile | null> {
  if (!TEMPLATE_ID.test(opts.templateId)) return null;
  const templateDir = path.join(opts.templatesRoot, opts.templateId);
  if (!existsSync(path.join(templateDir, "template.json"))) return null;

  const songId =
    opts.songId === "sample" && opts.resolveSample ? await opts.resolveSample() : opts.songId;
  if (!songId || !SONG_ID.test(songId)) return null;
  const songDir = path.join(opts.storageRoot, "songs", songId);
  const wavPath = path.join(songDir, "song.wav");
  if (!existsSync(wavPath)) return null;

  const segments = opts.path.map(safeSegment);
  if (segments.length === 0 || segments.some((s) => s === null)) return null;
  const relative = (segments as string[]).join("/");

  if (relative === "assets/song.wav")
    return { kind: "file", path: wavPath, contentType: "audio/wav" };

  if (relative === "index.html" || relative === "assets/audio-data.js") {
    let analysis: unknown;
    try {
      analysis = JSON.parse(await readFile(path.join(songDir, "analysis.json"), "utf8"));
    } catch {
      return null;
    }
    if (!isCurrentAnalysis(analysis)) return null;
    if (relative === "assets/audio-data.js")
      return { kind: "script", body: toAudioDataJs(analysis) };
    const html = await readFile(path.join(templateDir, "index.html"), "utf8");
    let body = injectRuntime(setSongLength(html, analysis.duration), RUNTIME_URL);
    const fonts = fontStylesheetUrl(templateFontFamilies(html));
    if (fonts) body = body.replace("</head>", `<link rel="stylesheet" href="${fonts}"></head>`);
    return { kind: "html", body };
  }

  const filePath = path.resolve(templateDir, ...(segments as string[]));
  if (!filePath.startsWith(path.resolve(templateDir) + path.sep)) return null;
  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }
  const contentType =
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return { kind: "file", path: filePath, contentType };
}
