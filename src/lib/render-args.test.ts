import { describe, expect, it } from "vitest";
import { outputName, parseRenderArgs } from "@/lib/render-args";

describe("parseRenderArgs", () => {
  it("reads every option", () => {
    const args = parseRenderArgs([
      ...["particle-horizon", "C:\Music\T-REX.wav", "--preset", "Ice"],
      ...["--background", "bg.png", "--start", "190", "--end", "220"],
      ...["--quality", "draft", "--phone", "--keep-job"],
    ]);
    expect(args).toEqual({
      templateId: "particle-horizon",
      song: "C:\Music\T-REX.wav",
      preset: "Ice",
      overrides: {},
      images: {},
      background: "bg.png",
      start: 190,
      end: 220,
      quality: "draft",
      phone: true,
      preview: false,
      keepJob: true,
    });
  });

  it("defaults to final quality without extras", () => {
    const args = parseRenderArgs(["particle-horizon", "song.wav", "--preview"]);
    expect(args.quality).toBe("final");
    expect(args.preview).toBe(true);
    expect(args.phone).toBe(false);
    expect(args.start).toBeUndefined();
  });

  it("collects repeated --set", () => {
    const args = parseRenderArgs(["p", "s.wav", "--set", "title=T-REX", "--set", "label=a=b"]);
    expect(args.overrides).toEqual({ title: "T-REX", label: "a=b" });
  });

  it("rejects a missing song and an unknown quality", () => {
    expect(() => parseRenderArgs(["particle-horizon"])).toThrow(/Usage/);
    expect(() => parseRenderArgs(["p", "s.wav", "--quality", "best"])).toThrow(/Usage/);
    expect(() => parseRenderArgs(["p", "s.wav", "--start", "soon"])).toThrow(/Usage/);
    expect(() => parseRenderArgs(["p", "s.wav", "--set", "novalue"])).toThrow(/Usage/);
    expect(() => parseRenderArgs(["p", "s.wav", "--start", "20", "--end", "10"])).toThrow(/Usage/);
  });
});

describe("outputName", () => {
  it("builds the export name", () => {
    const values = { artist: "AXIOM", title: "T-REX" };
    expect(outputName(values, "Particle Horizon", 190, 220)).toBe(
      "AXIOM - T-REX (Particle Horizon) 3.10-3.40.mp4",
    );
    expect(outputName(values, "Particle Horizon")).toBe("AXIOM - T-REX (Particle Horizon).mp4");
  });

  it("leaves the artist out for a template without one, and says Untitled for an empty one", () => {
    expect(outputName({ title: "T-REX", tagline: "AXIOM" }, "Late Show", 60, 90)).toBe(
      "T-REX (Late Show) 1.00-1.30.mp4",
    );
    expect(outputName({ artist: " ", title: "T-REX" }, "Halo Rings")).toBe(
      "Untitled - T-REX (Halo Rings).mp4",
    );
  });

  it("replaces characters Windows forbids", () => {
    expect(outputName({ artist: "A/B", title: 'Why? "Now"' }, "Particle Horizon")).toBe(
      "A_B - Why_ _Now_ (Particle Horizon).mp4",
    );
  });
});

describe("--image", () => {
  it("collects image settings by id", () => {
    const args = parseRenderArgs(["nova-streak", "s.wav", "--image", "cover=C:\art\a.png"]);
    expect(args.images).toEqual({ cover: "C:\art\a.png" });
    expect(parseRenderArgs(["nova-streak", "s.wav"]).images).toEqual({});
  });

  it("needs id=file", () => {
    expect(() => parseRenderArgs(["nova-streak", "s.wav", "--image", "novalue"])).toThrow(/Usage/);
  });
});
