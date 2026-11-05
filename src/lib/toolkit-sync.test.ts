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
  await writeFile(path.join(root, "shared", "three-kit.js"), "// three v1");
  for (const id of ["alpha", "beta"]) {
    await mkdir(path.join(root, id, "assets"), { recursive: true });
    await writeFile(path.join(root, id, "template.json"), "{}");
  }
  await writeFile(path.join(root, "alpha", "index.html"), '<script src="assets/viz-toolkit.js">');
  await writeFile(
    path.join(root, "beta", "index.html"),
    '<script src="assets/viz-toolkit.js"></script><script src="assets/three-kit.js"></script>',
  );
});

describe("toolkit sync", () => {
  it("syncToolkit copies the toolkit into every template", async () => {
    const written = await syncToolkit(root);
    expect(written.filter((f) => f.endsWith("viz-toolkit.js"))).toHaveLength(2);
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

  it("three-kit.js goes only to templates that use it", async () => {
    await syncToolkit(root);
    expect(existsSync(path.join(root, "alpha", "assets", "three-kit.js"))).toBe(false);
    expect(await readFile(path.join(root, "beta", "assets", "three-kit.js"), "utf8")).toBe(
      "// three v1",
    );
    const copies = await toolkitCopies(root);
    expect(copies.filter((c) => c.file === "three-kit.js").map((c) => c.template)).toEqual([
      "beta",
    ]);
    expect(copies.filter((c) => c.file === "viz-toolkit.js")).toHaveLength(2);
  });

  it("folders without template.json are skipped", async () => {
    await mkdir(path.join(root, "notes"));
    await syncToolkit(root);
    expect(existsSync(path.join(root, "notes", "assets", "viz-toolkit.js"))).toBe(false);
    const templates = new Set((await toolkitCopies(root)).map((c) => c.template));
    expect([...templates].sort()).toEqual(["alpha", "beta"]);
  });
});
