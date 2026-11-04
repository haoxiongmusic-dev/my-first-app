/**
 * Every template carries its own copy of the shared toolkit (`assets/viz-toolkit.js`), so
 * each template folder works on its own (HyperFrames check, preview, render). The original
 * lives in `templates/shared/`; these helpers keep the copies identical to it.
 */
import { existsSync } from "node:fs";
import { copyFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type ToolkitCopy = { template: string; path: string; upToDate: boolean };

async function templateIds(templatesRoot: string): Promise<string[]> {
  const entries = await readdir(templatesRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== "shared")
    .filter((e) => existsSync(path.join(templatesRoot, e.name, "template.json")))
    .map((e) => e.name)
    .sort();
}

/** Each template's toolkit copy and whether it matches the shared original. */
export async function toolkitCopies(templatesRoot: string): Promise<ToolkitCopy[]> {
  const original = await readFile(path.join(templatesRoot, "shared", "viz-toolkit.js"));
  const copies: ToolkitCopy[] = [];
  for (const template of await templateIds(templatesRoot)) {
    const copyPath = path.join(templatesRoot, template, "assets", "viz-toolkit.js");
    const upToDate = existsSync(copyPath) && original.equals(await readFile(copyPath));
    copies.push({ template, path: copyPath, upToDate });
  }
  return copies;
}

/** Copy the shared toolkit into every template that lacks it or has an old copy. */
export async function syncToolkit(templatesRoot: string): Promise<string[]> {
  const source = path.join(templatesRoot, "shared", "viz-toolkit.js");
  const written: string[] = [];
  for (const copy of await toolkitCopies(templatesRoot)) {
    if (copy.upToDate) continue;
    await copyFile(source, copy.path);
    written.push(copy.path);
  }
  return written;
}
