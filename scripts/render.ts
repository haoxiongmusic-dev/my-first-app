// `npm run render -- <template> <song> [options]`: render a template with a real song.
// The song is analyzed (or taken from the cache), copied with the template into a job folder
// in storage/jobs/, rendered by HyperFrames, then re-encoded into test-renders/.
// Run with no arguments to see every option.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { finalEncodeArgs, phoneCopyArgs } from "../src/lib/encode";
import { saveImage } from "../src/lib/images";
import { prepareJob } from "../src/lib/jobs";
import { outputName, parseRenderArgs, type RenderArgs } from "../src/lib/render-args";
import { runCommand } from "../src/lib/run-command";
import { prepareSong } from "../src/lib/songs";
import { loadTemplate, resolveValues } from "../src/lib/templates";

/** Run a program with its output shown live; true if it succeeded. */
function runLive(cmd: string, args: string[]): boolean {
  // On Windows `npx` is a .cmd file, which needs a shell; quote paths for it.
  const shell = process.platform === "win32" && cmd === "npx";
  // With a shell, Node wants one command string (our arguments are paths and fixed flags).
  const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a));
  const result = shell
    ? spawnSync([cmd, ...quoted].join(" "), { stdio: "inherit", shell, windowsHide: true })
    : spawnSync(cmd, args, { stdio: "inherit", windowsHide: true });
  return result.status === 0;
}

async function durationOf(file: string): Promise<number> {
  const probe = await runCommand("ffprobe", [
    ...["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
  ]);
  return Number(probe.stdout.trim());
}

async function encode(args: string[], what: string): Promise<void> {
  const result = await runCommand("ffmpeg", args);
  if (result.code !== 0) throw new Error(`${what} failed: ${result.stderr.trim()}`);
}

async function report(file: string): Promise<void> {
  const mb = (statSync(file).size / 1e6).toFixed(1);
  const seconds = (await durationOf(file)).toFixed(2);
  console.log(`  ${path.relative(process.cwd(), file)}  (${mb} MB, ${seconds} s)`);
}

function stamp(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

async function render(args: RenderArgs): Promise<void> {
  const root = process.cwd();
  const template = await loadTemplate(path.join(root, "templates", args.templateId));
  const storageRoot = path.join(root, "storage");
  // Each --image picture is stored like an upload; its id becomes that setting's value.
  const overrides = { ...args.overrides };
  for (const [id, file] of Object.entries(args.images)) {
    const variable = template.variables.find((v) => v.id === id);
    if (variable?.type !== "image") throw new Error(`--image ${id}: not an image setting`);
    overrides[id] = await saveImage(path.resolve(file), storageRoot, runCommand, variable.fit);
  }
  const values = resolveValues(template, { preset: args.preset, overrides });

  console.log(`Preparing the song…`);
  const song = await prepareSong({
    sourcePath: path.resolve(args.song),
    storageRoot,
    projectRoot: root,
    platform: process.platform,
    run: runCommand,
  });

  const jobDir = path.join(root, "storage", "jobs", `${stamp()}-${template.id}`);
  const job = await prepareJob({
    template,
    song,
    values,
    jobDir,
    backgroundPath: args.background ? path.resolve(args.background) : undefined,
    storageRoot,
    section:
      args.start !== undefined || args.end !== undefined
        ? { start: args.start ?? 0, end: args.end ?? Number.POSITIVE_INFINITY }
        : undefined,
    run: runCommand,
  });
  console.log(`Job folder: ${path.relative(root, jobDir)}`);

  if (args.preview) {
    console.log("Opening HyperFrames Studio (Ctrl+C to stop)…");
    runLive("npx", ["hyperframes", "preview", jobDir]);
    return;
  }

  const raw = path.join(jobDir, "raw.mp4");
  const renderArgs = ["hyperframes", "render", jobDir, "--variables-file", job.variablesPath];
  renderArgs.push(
    "--strict-variables",
    "--quality",
    args.quality === "draft" ? "draft" : "delivery",
  );
  renderArgs.push("-o", raw);
  console.log(`Rendering (${args.quality})…`);
  if (!runLive("npx", renderArgs)) {
    throw new Error(`Render failed. The job folder is kept for checking: ${jobDir}`);
  }

  const outDir = path.join(root, "test-renders");
  await mkdir(outDir, { recursive: true });
  const name = outputName(values, template.manifest.name, args.start, args.end);
  const final = path.join(outDir, name);
  console.log("Encoding…");
  await encode(finalEncodeArgs(raw, final), "Final encode");
  const outputs = [final];
  if (args.phone) {
    const phone = path.join(outDir, name.replace(/\.mp4$/, " (phone).mp4"));
    await encode(phoneCopyArgs(final, phone, await durationOf(final)), "Phone copy");
    outputs.push(phone);
  }

  console.log("Done:");
  for (const file of outputs) await report(file);
  if (args.keepJob) console.log(`Job folder kept: ${path.relative(root, jobDir)}`);
  else await rm(jobDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  let args: RenderArgs;
  try {
    args = parseRenderArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  await render(args);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
