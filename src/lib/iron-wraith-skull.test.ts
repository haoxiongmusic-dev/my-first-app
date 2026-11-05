// The Iron Wraith skull is built from voxels by templates/iron-wraith/assets/skull-voxels.js,
// plain browser JavaScript that loads as CommonJS under Node.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type Skull = {
  head: Voxel[];
  jaw: Voxel[];
  cables: Voxel[];
  eyes: Voxel[];
  jawPivot: [number, number, number];
};
const require = createRequire(import.meta.url);
const skull = require("../../templates/iron-wraith/assets/skull-voxels.js") as {
  buildSkull: () => Skull;
  SHADES: Record<number, number>;
};

const s = skull.buildSkull();
const all = [...s.head, ...s.jaw, ...s.cables];
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;

describe("Iron Wraith skull voxels", () => {
  it("is mirror-symmetric", () => {
    for (const part of [s.head, s.jaw, s.cables, s.eyes]) {
      const set = new Set(part.map(key));
      for (const v of part) expect(set.has(key([-v[0], v[1], v[2]])), key(v)).toBe(true);
    }
  });

  it("has a sensible size", () => {
    expect(all.length).toBeGreaterThanOrEqual(3000);
    expect(all.length).toBeLessThanOrEqual(10000);
  });

  it("uses whole-number positions", () => {
    for (const v of [...all, ...s.eyes]) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
    }
  });

  it("no two parts share a voxel", () => {
    const head = new Set(s.head.map(key));
    const jaw = new Set(s.jaw.map(key));
    expect(s.jaw.filter((v) => head.has(key(v)))).toEqual([]);
    expect(s.cables.filter((v) => head.has(key(v)) || jaw.has(key(v)))).toEqual([]);
  });

  it("eyes are visible from the front", () => {
    expect(s.eyes.length).toBeGreaterThan(0);
    for (const e of s.eyes) {
      const blocking = s.head.filter((h) => h[0] === e[0] && h[1] === e[1] && h[2] > e[2]);
      expect(blocking, key(e)).toEqual([]);
    }
  });

  it("is the same every time", () => {
    expect(skull.buildSkull()).toEqual(s);
  });

  it("uses only known shades", () => {
    expect(Object.keys(skull.SHADES).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const v of all) expect([1, 2, 3, 4, 5]).toContain(v[3]);
  });

  it("hinges the jaw near the ears", () => {
    expect(s.jawPivot).toEqual([0, -10, -3]);
  });
});
