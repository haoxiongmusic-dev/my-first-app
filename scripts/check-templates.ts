// `npm run check:templates`: run before committing any template change. For every template:
//   1. its toolkit copy matches templates/shared/viz-toolkit.js
//   2. its settings and template.json follow the rules (spec §6)
//   3. `hyperframes check` finds no errors
//   4. it reacts to the music: a quiet and a loud moment of the sample song differ clearly,
//      the loud one is brighter, and the quiet one is still visible
import { readFile } from "node:fs/promises";
import path from "node:path";
import { grayFrameArgs, grayStats } from "../src/lib/frames";
import { runCommand } from "../src/lib/run-command";
import { SAMPLE_SONG } from "../src/lib/sample-song";
import { ensureTemplateAssets } from "../src/lib/template-assets";
import { listTemplates, validateTemplate, type Template } from "../src/lib/templates";
import { toolkitCopies } from "../src/lib/toolkit-sync";

const MIN_DIFFERENCE = 6; // average pixel difference between quiet and loud (0–255)
const MIN_BRIGHTER = 3; // the loud frame must be at least this much brighter
const MIN_QUIET_BRIGHTNESS = 8; // the quiet frame must still show the field

type Section = { errorCount?: number; warningCount?: number; findings?: Finding[] };
type Finding = { severity?: string; code?: string; message?: string };

async function hyperframesCheck(t: Template): Promise<string[]> {
  const result = await runCommand("npx", ["hyperframes", "check", `"${t.dir}"`, "--json"]);
  let report: Record<string, Section>;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return [`hyperframes check did not run: ${result.stderr.trim().split("\n").at(-1)}`];
  }
  const problems: string[] = [];
  let warnings = 0;
  for (const [name, section] of Object.entries(report)) {
    if (typeof section !== "object" || section === null || !Array.isArray(section.findings))
      continue;
    warnings += section.warningCount ?? 0;
    for (const f of section.findings) {
      if (f.severity === "error") problems.push(`hyperframes ${name}: ${f.code}: ${f.message}`);
    }
  }
  console.log(`  hyperframes check: ${problems.length} errors, ${warnings} warnings`);
  return problems;
}

async function readGray(image: string): Promise<Uint8Array> {
  const out = `${image}.gray`;
  const result = await runCommand("ffmpeg", grayFrameArgs(image, out));
  if (result.code !== 0) throw new Error(`Couldn't read ${image}: ${result.stderr.trim()}`);
  return new Uint8Array(await readFile(out));
}

async function reactionCheck(t: Template): Promise<string[]> {
  const outDir = path.join(process.cwd(), "storage", "checks", t.id);
  const at = `${SAMPLE_SONG.quietAt},${SAMPLE_SONG.loudAt}`;
  const result = await runCommand("npx", [
    ...["hyperframes", "snapshot", `"${t.dir}"`, "--at", at, "--no-end", "--json"],
    ...["-o", `"${outDir}"`],
  ]);
  let frames: { path: string }[];
  try {
    frames = JSON.parse(result.stdout).frames;
  } catch {
    return [`hyperframes snapshot did not run: ${result.stderr.trim().split("\n").at(-1)}`];
  }
  if (!Array.isArray(frames) || frames.length !== 2) return ["snapshot did not return two frames"];
  const stats = grayStats(await readGray(frames[0].path), await readGray(frames[1].path));
  const r = (n: number) => n.toFixed(1);
  console.log(
    `  reaction: quiet ${r(stats.meanA)}, loud ${r(stats.meanB)}, difference ${r(stats.meanAbsDiff)}`,
  );
  const problems: string[] = [];
  if (stats.meanAbsDiff < MIN_DIFFERENCE) {
    problems.push(
      `quiet and loud frames differ by only ${r(stats.meanAbsDiff)} (need ${MIN_DIFFERENCE})`,
    );
  }
  if (stats.meanB < stats.meanA + MIN_BRIGHTER) {
    problems.push(`the loud frame is not brighter than the quiet one`);
  }
  if (stats.meanA < MIN_QUIET_BRIGHTNESS) {
    problems.push(
      `the quiet frame is nearly black (${r(stats.meanA)}; need ${MIN_QUIET_BRIGHTNESS})`,
    );
  }
  return problems;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const templatesRoot = path.join(root, "templates");
  let failed = false;

  const stale = (await toolkitCopies(templatesRoot)).filter((c) => !c.upToDate);
  if (stale.length > 0) {
    for (const c of stale) console.error(`${c.template}: toolkit copy is out of date`);
    console.error("Run: npm run sync:toolkit");
    process.exit(1);
  }
  await ensureTemplateAssets(root, runCommand);

  for (const t of await listTemplates(templatesRoot)) {
    console.log(`${t.id}`);
    const problems = validateTemplate(t);
    if (problems.length === 0) console.log("  settings and template.json: ok");
    if (problems.length === 0) problems.push(...(await hyperframesCheck(t)));
    if (problems.length === 0) problems.push(...(await reactionCheck(t)));
    for (const p of problems) console.error(`  ✗ ${p}`);
    if (problems.length > 0) failed = true;
    else console.log("  ✓ passed");
  }
  if (failed) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
