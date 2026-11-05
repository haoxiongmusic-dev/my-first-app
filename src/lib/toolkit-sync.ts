/**
 * Every template carries its own copies of the shared scripts in `assets/`, so each template
 * folder works on its own (HyperFrames check, preview, render). The originals live in
 * `templates/shared/`; these helpers keep the copies identical to them.
 *
 * - `viz-toolkit.js` goes into every template.
 * - `three-kit.js` (three.js, `npm run build:three`) goes only into templates whose
 *   `index.html` loads `assets/three-kit.js`.
 */
import { existsSync } from "node:fs";
import { copyFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type SharedFile = "viz-toolkit.js" | "three-kit.js";

export type ToolkitCopy = { template: string; file: SharedFile; path: string; upToDate: boolean };

async function templateIds(templatesRoot: string): Promise<string[]> {
  const entries = await readdir(templatesRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== "shared")
    .filter((e) => existsSync(path.join(templatesRoot, e.name, "template.json")))
    .map((e) => e.name)
    .sort();
}

async function usesThreeKit(templateDir: string): Promise<boolean> {
  const index = path.join(templateDir, "index.html");
  return existsSync(index) && (await readFile(index, "utf8")).includes("assets/three-kit.js");
}

/** Each template's copies of the shared scripts and whether they match the originals. */
export async function toolkitCopies(templatesRoot: string): Promise<ToolkitCopy[]> {
  const originals = new Map<SharedFile, Buffer>();
  const original = async (file: SharedFile): Promise<Buffer> => {
    if (!originals.has(file)) {
      originals.set(file, await readFile(path.join(templatesRoot, "shared", file)));
    }
    return originals.get(file)!;
  };
  const copies: ToolkitCopy[] = [];
  for (const template of await templateIds(templatesRoot)) {
    const dir = path.join(templatesRoot, template);
    const files: SharedFile[] = ["viz-toolkit.js"];
    if (await usesThreeKit(dir)) files.push("three-kit.js");
    for (const file of files) {
      const copyPath = path.join(dir, "assets", file);
      const upToDate =
        existsSync(copyPath) && (await original(file)).equals(await readFile(copyPath));
      copies.push({ template, file, path: copyPath, upToDate });
    }
  }
  return copies;
}

/** Copy the shared scripts into every template that lacks them or has an old copy. */
export async function syncToolkit(templatesRoot: string): Promise<string[]> {
  const written: string[] = [];
  for (const copy of await toolkitCopies(templatesRoot)) {
    if (copy.upToDate) continue;
    await copyFile(path.join(templatesRoot, "shared", copy.file), copy.path);
    written.push(copy.path);
  }
  return written;
}
