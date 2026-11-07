// Each template keeps its own copy of the shared toolkit (and of the three.js bundle where it
// uses one): HyperFrames renders a template folder on its own. `npm run sync:toolkit` copies
// them; this test catches a copy that was edited by hand or not synced.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const templatesDir = path.join(process.cwd(), "templates");
const shared = (name: string) => readFileSync(path.join(templatesDir, "shared", name));
const templates = readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "shared")
  .map((d) => d.name);

describe("toolkit copies", () => {
  it.each(templates)("%s has an identical copy of viz-toolkit.js", (id) => {
    const copy = readFileSync(path.join(templatesDir, id, "assets", "viz-toolkit.js"));
    expect(copy.equals(shared("viz-toolkit.js"))).toBe(true);
  });

  it.each(templates)("%s has an identical three-kit.js if it uses one", (id) => {
    const page = readFileSync(path.join(templatesDir, id, "index.html"), "utf8");
    const copyPath = path.join(templatesDir, id, "assets", "three-kit.js");
    if (!page.includes("three-kit.js")) return;
    expect(existsSync(copyPath)).toBe(true);
    expect(readFileSync(copyPath).equals(shared("three-kit.js"))).toBe(true);
  });
});
