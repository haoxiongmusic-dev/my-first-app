import { describe, expect, it } from "vitest";
import { thumbSection } from "@/lib/thumbs";

// The template's title fades in until 1.9 s and the picture fades out over the last 2.5 s.
const TITLE_DONE = 1.9;
const FADE = 2.5;

describe("thumbSection", () => {
  it("captures after the title fade-in and before the end fade", () => {
    const s = thumbSection(200, 252.4);
    expect(s.local).toBeGreaterThanOrEqual(TITLE_DONE);
    expect(s.local).toBeLessThanOrEqual(s.end - s.start - FADE);
    expect(s.start + s.local).toBeCloseTo(200, 6);
  });

  it("stays inside the song near its edges", () => {
    const early = thumbSection(1, 252.4);
    expect(early.start).toBe(0);
    expect(early.start + early.local).toBeCloseTo(1, 6);
    const late = thumbSection(251, 252.4);
    expect(late.end).toBeLessThanOrEqual(252.4);
    expect(late.start + late.local).toBeCloseTo(251, 6);
  });
});
