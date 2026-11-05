import { mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileAtomic } from "@/lib/exports/atomic-write";

describe("writeFileAtomic", () => {
  it("replaces a file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "atomic-"));
    const file = path.join(dir, "status.json");
    await writeFile(file, "old");
    await writeFileAtomic(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
  });

  it("waits out a reader that briefly holds the file open (Windows refuses the rename)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "atomic-"));
    const file = path.join(dir, "status.json");
    await writeFile(file, "old");
    const reader = await open(file, "r"); // like the app reading the status at the same moment
    const released = new Promise<void>((resolve) =>
      setTimeout(() => reader.close().then(resolve), 80),
    );
    await writeFileAtomic(file, "new");
    await released;
    expect(await readFile(file, "utf8")).toBe("new");
  });
});
