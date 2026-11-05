import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOO_BIG_MESSAGE, UNREADABLE_MESSAGE } from "@/lib/songs";
import { saveUpload } from "@/lib/uploads";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("saveUpload", () => {
  it("writes the stream to a file with the song's extension", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "upload-"));
    const saved = await saveUpload(
      streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]),
      dir,
      "My Song.MP3",
      1000,
    );
    expect(path.extname(saved)).toBe(".mp3");
    expect([...readFileSync(saved)]).toEqual([1, 2, 3]);
  });

  it("stops at the byte limit and removes the partial file", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "upload-"));
    const chunk = () => new Uint8Array(400);
    await expect(
      saveUpload(streamOf([chunk(), chunk(), chunk()]), dir, "a.wav", 1000),
    ).rejects.toThrow(TOO_BIG_MESSAGE);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("rejects other file types", async () => {
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), "upload-")), "inner");
    await expect(saveUpload(streamOf([new Uint8Array(1)]), dir, "notes.txt", 1000)).rejects.toThrow(
      UNREADABLE_MESSAGE,
    );
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});
