import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, TOO_BIG_IMAGE_MESSAGE } from "@/lib/backgrounds";
import {
  imageArgs,
  imageFileResponse,
  imagePath,
  saveImage,
  uploadImageResponse,
} from "@/lib/images";
import { UNREADABLE_IMAGE_MESSAGE } from "@/lib/jobs";
import { runCommand, type RunCommand } from "@/lib/run-command";
import { IMAGE_ID } from "@/lib/template-values";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "img-"));
}

/** Make a picture with FFmpeg's test sources (nothing is committed). */
async function makePicture(file: string, source: string): Promise<void> {
  const args = ["-y", "-v", "error", "-f", "lavfi", "-i", source, "-frames:v", "1", file];
  const result = await runCommand("ffmpeg", args);
  if (result.code !== 0) throw new Error(result.stderr);
}

async function size(file: string): Promise<[number, number]> {
  const args = ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", file];
  const out = (await runCommand("ffprobe", args)).stdout.trim().split(",").map(Number);
  return [out[0], out[1]];
}

/** The grey level (0..255) of one pixel. */
async function pixel(file: string, x: number, y: number): Promise<number> {
  const args = ["-v", "error", "-i", file, "-vf", `crop=2:2:${x}:${y},format=gray`];
  const result = await new Promise<Buffer>((resolve, reject) => {
    execFile("ffmpeg", [...args, "-f", "rawvideo", "-"], { encoding: "buffer" }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    );
  });
  return result[0];
}

function put(url: string, body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "PUT", body, headers, duplex: "half" } as RequestInit);
}

// Real FFmpeg runs: allow for a busy machine when the whole suite runs in parallel.
const SLOW = { timeout: 60_000 };

describe("image settings: storage and conversion", SLOW, () => {
  it("imageArgs covers 1024×1024 on black, one JPEG at q 2", () => {
    const a = imageArgs("in.png", "out.jpg", "square").join(" ");
    expect(a).toContain("color=black:s=1024x1024");
    expect(a).toContain("scale=1024:1024:force_original_aspect_ratio=increase,crop=1024:1024");
    expect(a).toContain("-frames:v 1 -q:v 2 out.jpg");
  });

  it("imagePath is <root>/images/<id>-<fit>.jpg", () => {
    const id = "c".repeat(64);
    expect(imagePath("S", id, "square")).toBe(path.join("S", "images", `${id}-square.jpg`));
  });

  it("saveImage turns a 300×200 PNG into a 1024×1024 JPEG at imagePath", async () => {
    const root = await tempRoot();
    const source = path.join(root, "wide.png");
    await makePicture(source, "testsrc2=s=300x200");
    const storage = path.join(root, "storage");
    const id = await saveImage(source, storage, runCommand, "square");
    expect(id).toMatch(IMAGE_ID);
    const stored = imagePath(storage, id, "square");
    expect(existsSync(stored)).toBe(true);
    expect(await size(stored)).toEqual([1024, 1024]);
  });

  it("saveImage squares a 200×600 transparent PNG without stretching", async () => {
    const root = await tempRoot();
    const source = path.join(root, "tall.png");
    await makePicture(source, "color=red@0.0:s=200x600,format=rgba");
    const storage = path.join(root, "storage");
    const stored = imagePath(
      storage,
      await saveImage(source, storage, runCommand, "square"),
      "square",
    );
    expect(await size(stored)).toEqual([1024, 1024]);
    expect(await pixel(stored, 512, 512)).toBeLessThan(16); // transparent → black, not red
  });

  it("saveImage crops a tall picture from the centre instead of squashing it", async () => {
    // 200×600: red top, green middle, blue bottom. A centre crop keeps only the green band;
    // squashing would put red at the top edge and blue at the bottom edge.
    const root = await tempRoot();
    const source = path.join(root, "bands.png");
    const band = (c: string) => `color=${c}:s=200x200`;
    const args = ["-y", "-v", "error", "-f", "lavfi", "-i", band("red"), "-f", "lavfi"];
    args.push("-i", band("lime"), "-f", "lavfi", "-i", band("blue"));
    args.push("-filter_complex", "[0][1][2]vstack=3", "-frames:v", "1", source);
    expect((await runCommand("ffmpeg", args)).code).toBe(0);
    const storage = path.join(root, "storage");
    const stored = imagePath(
      storage,
      await saveImage(source, storage, runCommand, "square"),
      "square",
    );
    const green = 150; // the grey level of pure green (red ≈ 76, blue ≈ 29)
    for (const [x, y] of [
      [512, 512],
      [512, 4],
      [512, 1018],
      [4, 512],
    ]) {
      expect(Math.abs((await pixel(stored, x, y)) - green), `${x},${y}`).toBeLessThan(20);
    }
  });

  it("saveImage converts once and reuses the stored image", async () => {
    const root = await tempRoot();
    const source = path.join(root, "photo.png");
    await writeFile(source, "PNG bytes");
    let calls = 0;
    const run: RunCommand = async (_cmd, args) => {
      calls++;
      await writeFile(args[args.length - 1], "JPG");
      return { code: 0, stdout: "", stderr: "" };
    };
    const storage = path.join(root, "storage");
    const id = await saveImage(source, storage, run, "square");
    expect(await saveImage(source, storage, run, "square")).toBe(id);
    expect(calls).toBe(1);
  });

  it("saveImage reports an unreadable image", async () => {
    const root = await tempRoot();
    const source = path.join(root, "notes.png");
    await writeFile(source, "not an image");
    await expect(
      saveImage(source, path.join(root, "storage"), runCommand, "square"),
    ).rejects.toThrow(UNREADABLE_IMAGE_MESSAGE);
  });
});

describe("image settings: upload and serve", SLOW, () => {
  it("upload: a good PNG returns an id", async () => {
    const root = await tempRoot();
    const source = path.join(root, "a.png");
    await makePicture(source, "testsrc2=s=320x240");
    const response = await uploadImageResponse(
      put("http://x/api/images?fit=square", await readFile(source), { "x-file-name": "a.png" }),
      path.join(root, "storage"),
      runCommand,
    );
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    expect(id).toMatch(IMAGE_ID);
    expect(existsSync(imagePath(path.join(root, "storage"), id, "square"))).toBe(true);
  });

  it("upload: unknown fit is 400", async () => {
    const root = await tempRoot();
    for (const url of ["http://x/api/images?fit=round", "http://x/api/images"]) {
      const response = await uploadImageResponse(
        put(url, "x", { "x-file-name": "a.png" }),
        root,
        runCommand,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Unknown image fit." });
    }
  });

  it("upload: too big, wrong type and unreadable give the shared messages", async () => {
    const root = await tempRoot();
    const url = "http://x/api/images?fit=square";
    const big = await uploadImageResponse(
      put(url, "x", { "x-file-name": "a.png", "content-length": String(MAX_IMAGE_BYTES + 1) }),
      root,
      runCommand,
    );
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: TOO_BIG_IMAGE_MESSAGE });

    for (const name of ["a.txt", "a.png"]) {
      const response = await uploadImageResponse(
        put(url, "garbage", { "x-file-name": name }),
        root,
        runCommand,
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: UNREADABLE_IMAGE_MESSAGE });
    }

    const empty = await uploadImageResponse(put(url, null), root, runCommand);
    expect(empty.status).toBe(422);
  });

  it("serve: 200 image/jpeg for a stored image", async () => {
    const root = await tempRoot();
    const source = path.join(root, "a.png");
    await makePicture(source, "testsrc2=s=64x64");
    const id = await saveImage(source, root, runCommand, "square");
    const response = await imageFileResponse(root, id, "square.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.equals(await readFile(imagePath(root, id, "square")))).toBe(true);
  });

  it("serve: 400 for a malformed id, 404 for unknown id, unknown fit or other file names", async () => {
    const root = await tempRoot();
    for (const id of ["../x", "A".repeat(64), "a".repeat(63)]) {
      expect((await imageFileResponse(root, id, "square.jpg")).status).toBe(400);
    }
    const id = "d".repeat(64);
    expect((await imageFileResponse(root, id, "square.jpg")).status).toBe(404);
    for (const file of ["round.jpg", "square.png", "..", "square.jpg/x"]) {
      expect((await imageFileResponse(root, id, file)).status).toBe(404);
    }
  });
});
