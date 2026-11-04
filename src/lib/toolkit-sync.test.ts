import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { syncToolkit, toolkitCopies } from "@/lib/toolkit-sync";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "toolkit-sync-"));
  await mkdir(path.join(root, "shared"));
  await writeFile(path.join(root, "shared", "viz-toolkit.js"), "// toolkit v2");
  for (const id of ["alpha", "beta"]) {
    await mkdir(path.join(root, id, "assets"), { recursive: true });
    await writeFile(path.join(root, id, "template.json"), "{}");
  }
});

describe("toolkit sync", () => {
  it("syncToolkit copies the toolkit into every template", async () => {
    const written = await syncToolkit(root);
    expect(written).toHaveLength(2);
    for (const id of ["alpha", "beta"]) {
      const copy = await readFile(path.join(root, id, "assets", "viz-toolkit.js"), "utf8");
      expect(copy).toBe("// toolkit v2");
    }
    expect((await toolkitCopies(root)).every((c) => c.upToDate)).toBe(true);
  });

  it("toolkitCopies reports a stale copy", async () => {
    await syncToolkit(root);
    await writeFile(path.join(root, "beta", "assets", "viz-toolkit.js"), "// old");
    const copies = await toolkitCopies(root);
    expect(copies.find((c) => c.template === "alpha")?.upToDate).toBe(true);
    expect(copies.find((c) => c.template === "beta")?.upToDate).toBe(false);
  });

  it("folders without template.json are skipped", async () => {
    await mkdir(path.join(root, "notes"));
    await syncToolkit(root);
    expect(existsSync(path.join(root, "notes", "assets", "viz-toolkit.js"))).toBe(false);
    expect((await toolkitCopies(root)).map((c) => c.template).sort()).toEqual(["alpha", "beta"]);
  });
});
