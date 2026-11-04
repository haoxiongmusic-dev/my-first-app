import { describe, expect, it } from "vitest";
import { runCommand } from "@/lib/run-command";

describe("runCommand", () => {
  it("returns the exit code of a program that prints a lot of errors", async () => {
    // A badly damaged MP3 makes FFmpeg print a line per broken packet: well over 1 MB.
    const script = "process.stderr.write('x'.repeat(3 * 1024 * 1024)); process.exit(3)";
    const result = await runCommand(process.execPath, ["-e", script]);
    expect(result.code).toBe(3);
    expect(result.stderr.length).toBe(3 * 1024 * 1024);
  });
});
