// The start-up GPU check: one tiny render tells whether HyperFrames drew with the graphics chip
// or fell back to slow software drawing, so the editor can say so.
import { describe, expect, it } from "vitest";
import {
  checkGpu,
  getGpuStatus,
  parseGpuMode,
  renderGpuArgs,
  shouldCheckGpu,
  type GpuStatus,
} from "@/lib/gpu-check";

// A real summary line from this PC's renders, and its software twin.
const HARDWARE =
  "   screenshot capture · hardware gpu · compile 1.3s · extract 0.0s · audio 16.0s · probe 0.3s · setup 19.7s · capture 2m 15.5s · encode 4.0s · assemble 2.4s";
const SOFTWARE =
  "   screenshot capture · software gpu · compile 2.1s · extract 0.0s · audio 3.0s · probe 0.2s · setup 9.9s · capture 4m 1.0s · encode 1.0s · assemble 0.4s";

describe("GPU check", () => {
  it("reads which way HyperFrames drew from its summary line", () => {
    expect(parseGpuMode(`Render complete\n${HARDWARE}\nDone`)).toBe("hardware");
    expect(parseGpuMode(SOFTWARE)).toBe("software");
    expect(parseGpuMode("nothing useful here")).toBeNull();
  });

  it("adds the GPU flag to renders only when RENDER_GPU=1", () => {
    expect(renderGpuArgs({})).toEqual([]);
    expect(renderGpuArgs({ RENDER_GPU: "0" })).toEqual([]);
    expect(renderGpuArgs({ RENDER_GPU: "1" })).toContain("--browser-gpu");
  });

  it("checks only on the online version (logins on) or when asked; never with GPU_CHECK=0", () => {
    expect(shouldCheckGpu({})).toBe(false); // the owner's PC
    expect(shouldCheckGpu({ ACCOUNTS: "ana:scrypt$a$b" })).toBe(true);
    expect(shouldCheckGpu({ ACCOUNTS: "ana:scrypt$a$b", GPU_CHECK: "0" })).toBe(false);
    expect(shouldCheckGpu({ GPU_CHECK: "1" })).toBe(true);
  });

  it("is off until a check starts, so the owner's PC shows no status", () => {
    expect(getGpuStatus()).toEqual({ gpu: "off", seconds: null });
  });

  it("reports checking, then the result and how long it took", async () => {
    const seen: GpuStatus[] = [];
    let clock = 1000;
    let finish: (out: string) => void = () => {};
    const done = checkGpu(
      () => new Promise((resolve) => (finish = (out) => resolve({ code: 0, output: out }))),
      (s) => seen.push(s),
      () => clock,
    );
    expect(seen.at(-1)).toEqual({ gpu: "checking", seconds: null });
    clock = 13_500;
    finish(SOFTWARE);
    await done;
    expect(seen.at(-1)).toEqual({ gpu: "software", seconds: 12.5 });
  });

  it("reports failed when the render fails or says nothing", async () => {
    const seen: GpuStatus[] = [];
    await checkGpu(
      async () => ({ code: 1, output: HARDWARE }),
      (s) => seen.push(s),
      () => 0,
    );
    expect(seen.at(-1)?.gpu).toBe("failed");
    await checkGpu(
      async () => {
        throw new Error("no chrome");
      },
      (s) => seen.push(s),
      () => 0,
    );
    expect(seen.at(-1)?.gpu).toBe("failed");
    await checkGpu(
      async () => ({ code: 0, output: "no summary" }),
      (s) => seen.push(s),
      () => 0,
    );
    expect(seen.at(-1)?.gpu).toBe("failed");
  });
});
