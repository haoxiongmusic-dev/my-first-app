import { describe, expect, it } from "vitest";
import { clampSection, isWholeSong, sectionFromPointer, sectionLabel } from "@/lib/section";

describe("song section", () => {
  it("clampSection keeps the handles in order and inside the song", () => {
    expect(clampSection({ start: 200, end: 100 }, 252, "start")).toEqual({ start: 99, end: 100 });
    expect(clampSection({ start: 100, end: 50 }, 252, "end")).toEqual({ start: 100, end: 101 });
    expect(clampSection({ start: 10, end: 300 }, 252, "end")).toEqual({ start: 10, end: 252 });
    expect(clampSection({ start: -5, end: 30 }, 252, "start")).toEqual({ start: 0, end: 30 });
    expect(clampSection({ start: 251.8, end: 252 }, 252, "start")).toEqual({
      start: 251,
      end: 252,
    });
    expect(clampSection({ start: 0.2, end: 0.4 }, 0.5, "start")).toEqual({ start: 0, end: 0.5 });
  });

  it("sectionFromPointer maps the strip width to seconds", () => {
    expect(sectionFromPointer(0, 400, 252)).toBe(0);
    expect(sectionFromPointer(200, 400, 252)).toBe(126);
    expect(sectionFromPointer(401, 400, 252)).toBe(252);
    expect(sectionFromPointer(-3, 400, 252)).toBe(0);
    expect(sectionFromPointer(100, 400, 10)).toBe(2.5);
  });

  it("sectionLabel names the whole song and a part", () => {
    expect(isWholeSong({ start: 0, end: 252 }, 252)).toBe(true);
    expect(sectionLabel({ start: 0, end: 252 }, 252)).toBe("Whole song (4:12)");
    expect(sectionLabel({ start: 190, end: 220 }, 252)).toBe("3:10 – 3:40 (0:30)");
  });
});
