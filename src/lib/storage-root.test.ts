// Where the app keeps its files: <project>/storage, or STORAGE_DIR (the cloud machine's kept
// disk). Every storage path in the app goes through storageRoot().
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storageRoot } from "@/lib/storage-root";

const root = path.resolve("/projects/app");

describe("storageRoot", () => {
  it("defaults to <project>/storage when STORAGE_DIR is unset or blank", () => {
    expect(storageRoot(root, {})).toBe(path.join(root, "storage"));
    expect(storageRoot(root, { STORAGE_DIR: "" })).toBe(path.join(root, "storage"));
    expect(storageRoot(root, { STORAGE_DIR: "   " })).toBe(path.join(root, "storage"));
  });

  it("uses STORAGE_DIR when set, made absolute", () => {
    const kept = path.resolve("/workspace/storage");
    expect(storageRoot(root, { STORAGE_DIR: kept })).toBe(kept);
    expect(storageRoot(root, { STORAGE_DIR: "data/files" })).toBe(path.resolve("data/files"));
  });

  it("is the only place that builds a storage path", async () => {
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) files.push(full);
      }
    }
    await walk(path.join(process.cwd(), "src"));
    await walk(path.join(process.cwd(), "scripts"));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith("storage-root.ts")) continue;
      if (/, "storage"[,)]/.test(await readFile(file, "utf8"))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
