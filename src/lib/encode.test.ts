import { describe, expect, it } from "vitest";
import { exportEncodeArgs, finalEncodeArgs, phoneCopyArgs, phoneVideoKbps } from "@/lib/encode";

describe("encode settings", () => {
  it("phoneVideoKbps keeps a full song under 30 MB", () => {
    expect(phoneVideoKbps(252)).toBe(697);
    const megabytes = (252 * (phoneVideoKbps(252) + 128)) / 8 / 1000;
    expect(megabytes).toBeLessThan(30);
    expect(phoneVideoKbps(30)).toBe(4000);
    expect(phoneVideoKbps(3600)).toBe(300);
  });

  it("phoneCopyArgs makes a 720p copy at that bitrate", () => {
    const args = phoneCopyArgs("in.mp4", "out.mp4", 252);
    expect(args).toContain("scale=-2:720");
    expect(args.join(" ")).toContain("-b:v 697k");
    expect(args.join(" ")).toContain("-b:a 128k");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("finalEncodeArgs uses CRF 20, AAC 320k and faststart", () => {
    const joined = finalEncodeArgs("raw.mp4", "final.mp4").join(" ");
    expect(joined).toContain("-i raw.mp4");
    expect(joined).toContain("-c:v libx264");
    expect(joined).toContain("-crf 20");
    expect(joined).toContain("-c:a aac -b:a 320k");
    expect(joined).toContain("-movflags +faststart");
    expect(joined.endsWith("final.mp4")).toBe(true);
  });
});

describe("export encode settings", () => {
  it("exportEncodeArgs for final 1080p, final 1440p and draft", () => {
    const final = exportEncodeArgs("raw.mp4", "out.mp4", {
      quality: "final",
      resolution: "1080p",
    }).join(" ");
    expect(final).toContain("-crf 20");
    expect(final).toContain("-b:a 320k");
    expect(final).toContain("-progress pipe:1");
    expect(final).toContain("-preset medium");
    expect(final).not.toContain("-vf");
    expect(final.endsWith("out.mp4")).toBe(true);
    const big = exportEncodeArgs("raw.mp4", "out.mp4", {
      quality: "final",
      resolution: "1440p",
    }).join(" ");
    expect(big).toContain("-vf scale=2560:1440:flags=lanczos");
    const draft = exportEncodeArgs("raw.mp4", "out.mp4", {
      quality: "draft",
      resolution: "1440p",
    }).join(" ");
    expect(draft).toContain("-vf scale=-2:720");
    expect(draft).toContain("-preset veryfast");
  });
});
