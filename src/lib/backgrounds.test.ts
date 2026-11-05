import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backgroundArgs, saveBackground } from "@/lib/backgrounds";
import type { RunCommand } from "@/lib/run-command";

describe("background images", () => {
  it("backgroundArgs covers 1920×1080 and flattens transparency onto black", () => {
    const joined = backgroundArgs("in.png", "out.jpg").join(" ");
    expect(joined).toContain("color=black:s=1920x1080");
    expect(joined).toContain("force_original_aspect_ratio=increase");
    expect(joined).toContain("crop=1920:1080");
    expect(joined).toContain("overlay");
    expect(joined).toContain("-frames:v 1");
    expect(joined.endsWith("out.jpg")).toBe(true);
  });

  it("saveBackground converts once and reuses the cached image", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bg-"));
    const source = path.join(root, "photo.png");
    await writeFile(source, "PNG bytes");
    let calls = 0;
    const run: RunCommand = async (_cmd, args) => {
      calls++;
      await writeFile(args[args.length - 1], "JPG");
      return { code: 0, stdout: "", stderr: "" };
    };
    const storage = path.join(root, "storage");
    const id = await saveBackground(source, storage, run);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(path.join(storage, "backgrounds", `${id}.jpg`))).toBe(true);
    expect(await saveBackground(source, storage, run)).toBe(id);
    expect(calls).toBe(1);
  });

  it("saveBackground reports an unreadable image", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bg-"));
    const source = path.join(root, "notes.png");
    await writeFile(source, "not an image");
    const run: RunCommand = async () => ({ code: 1, stdout: "", stderr: "Invalid data" });
    await expect(saveBackground(source, path.join(root, "storage"), run)).rejects.toThrow(
      "Couldn't read this image. Try JPG or PNG.",
    );
  });
});
