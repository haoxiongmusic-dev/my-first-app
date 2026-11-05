/**
 * Command-line options for `npm run render` (a developer tool for rendering a template with a
 * real song before the editor and export screens exist), and the finished file's name.
 */
import type { TemplateValues } from "@/lib/templates";

export const USAGE = [
  "Usage: npm run render -- <template> <song> [options]",
  "  --preset <name>        start from a preset (e.g. Ice)",
  "  --set <id>=<value>     change one setting (repeatable), e.g. --set title=T-REX",
  "  --background <image>   background image (JPG or PNG)",
  "  --image <id>=<file>    a picture for an image setting, e.g. --image cover=art.png",
  "  --start <s> --end <s>  render only this part of the song (seconds)",
  "  --quality draft|final  draft is quicker, final is full quality (default: final)",
  "  --phone                also make a 720p copy under 30 MB",
  "  --preview              open the job in HyperFrames Studio instead of rendering",
  "  --keep-job             keep the job folder in storage/jobs/ afterwards",
].join("\n");

export type RenderArgs = {
  templateId: string;
  song: string;
  preset?: string;
  overrides: Record<string, string>;
  /** image setting id → picture file */
  images: Record<string, string>;
  background?: string;
  start?: number;
  end?: number;
  quality: "draft" | "final";
  phone: boolean;
  preview: boolean;
  keepJob: boolean;
};

export function parseRenderArgs(argv: string[]): RenderArgs {
  const fail = (why: string): never => {
    throw new Error(`${why}\n\n${USAGE}`);
  };
  const positional: string[] = [];
  const args: Omit<RenderArgs, "templateId" | "song"> = {
    overrides: {},
    images: {},
    quality: "final",
    phone: false,
    preview: false,
    keepJob: false,
  };
  const seconds = (text: string | undefined, flag: string): number => {
    const value = Number(text);
    if (text === undefined || text.trim() === "" || !Number.isFinite(value) || value < 0) {
      fail(`${flag} needs a number of seconds`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) fail(`${arg} needs a value`);
      return value;
    };
    if (arg === "--preset") args.preset = next();
    else if (arg === "--background") args.background = next();
    else if (arg === "--start") args.start = seconds(argv[++i], "--start");
    else if (arg === "--end") args.end = seconds(argv[++i], "--end");
    else if (arg === "--phone") args.phone = true;
    else if (arg === "--preview") args.preview = true;
    else if (arg === "--keep-job") args.keepJob = true;
    else if (arg === "--quality") {
      const q = next();
      if (q !== "draft" && q !== "final") fail(`--quality must be draft or final, not "${q}"`);
      args.quality = q as "draft" | "final";
    } else if (arg === "--set") {
      const pair = next();
      const eq = pair.indexOf("=");
      if (eq <= 0) fail(`--set needs id=value, not "${pair}"`);
      args.overrides[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === "--image") {
      const pair = next();
      const eq = pair.indexOf("=");
      if (eq <= 0 || eq === pair.length - 1) fail(`--image needs id=file, not "${pair}"`);
      args.images[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg.startsWith("--")) fail(`Unknown option ${arg}`);
    else positional.push(arg);
  }

  if (positional.length !== 2) fail("Give a template and a song");
  if (args.start !== undefined && args.end !== undefined && args.end <= args.start) {
    fail("--end must be after --start");
  }
  return { templateId: positional[0], song: positional[1], ...args };
}

/** 190 → "3.10" (minutes.seconds, as in a file name) */
function minutesSeconds(total: number): string {
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}.${String(s % 60).padStart(2, "0")}`;
}

/** "<artist> - <title> (<Template name>)[ <start>-<end>].mp4", safe as a Windows file name. */
export function outputName(
  values: TemplateValues,
  templateName: string,
  start?: number,
  end?: number,
): string {
  const artist = String(values.artist ?? "").trim() || "Untitled";
  const title = String(values.title ?? "").trim() || "Untitled";
  let name = `${artist} - ${title} (${templateName})`;
  if (start !== undefined || end !== undefined) {
    name += ` ${minutesSeconds(start ?? 0)}-${end === undefined ? "end" : minutesSeconds(end)}`;
  }
  return `${name.replace(/[\\/:*?"<>|]/g, "_")}.mp4`;
}
