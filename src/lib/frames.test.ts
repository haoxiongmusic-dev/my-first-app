import { describe, expect, it } from "vitest";
import { grayFrameArgs, grayStats } from "@/lib/frames";

describe("frame comparison", () => {
  it("grayStats measures brightness and difference", () => {
    const stats = grayStats(new Uint8Array([0, 10]), new Uint8Array([10, 30]));
    expect(stats).toEqual({ meanA: 5, meanB: 20, meanAbsDiff: 15 });
  });

  it("grayStats needs frames of the same size", () => {
    expect(() => grayStats(new Uint8Array(2), new Uint8Array(3))).toThrow(/same size/);
  });

  it("grayFrameArgs scales to 192×108 gray raw", () => {
    const args = grayFrameArgs("still.png", "still.gray");
    expect(args.join(" ")).toContain("-i still.png");
    expect(args.join(" ")).toContain("scale=192:108,format=gray");
    expect(args.join(" ")).toContain("-f rawvideo");
    expect(args.at(-1)).toBe("still.gray");
  });
});
