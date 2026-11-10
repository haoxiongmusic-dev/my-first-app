// Static Tower's stack of old TVs is built from voxels by
// templates/static-tower/assets/tv-voxels.js, plain browser JavaScript that loads as CommonJS.
// (Late Show has its own, different tv-voxels.js for its one big bezel.)
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number, number];
type Screen = { x: number; y: number; w: number; h: number; z: number };
type TV = {
  index: number;
  row: number;
  x0: number;
  y0: number;
  z0: number;
  w: number;
  h: number;
  d: number;
  style: "plain" | "side" | "below";
  palette: number;
  screen: Screen;
  antenna: { tip: [number, number, number] } | null;
};
type Tower = {
  tvs: TV[];
  cabinet: Voxel[];
  trim: Voxel[];
  chrome: Voxel[];
  width: number;
  height: number;
  top: [number, number, number];
};
const require = createRequire(import.meta.url);
const tv = require("../../templates/static-tower/assets/tv-voxels.js") as {
  SEED: number;
  ROWS: number[];
  PALETTES: [number, number, number][];
  MAX_VOXELS: number;
  buildTower: (seed?: number) => Tower;
};

const t = tv.buildTower();
const all = [...t.cabinet, ...t.trim, ...t.chrome];
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;

describe("Static Tower TV voxels", () => {
  it("is the same every time for a seed, and another seed gives another stack", () => {
    expect(tv.buildTower()).toEqual(t);
    expect(tv.buildTower(tv.SEED)).toEqual(t);
    const other = tv.buildTower(tv.SEED + 1);
    expect(other.tvs.map((x) => [x.w, x.palette, x.style])).not.toEqual(
      t.tvs.map((x) => [x.w, x.palette, x.style]),
    );
  });

  it("has a sensible size (at most 15,000 voxels for the whole stack)", () => {
    expect(tv.MAX_VOXELS).toBe(15000);
    for (const seed of [tv.SEED, 1, 2, 3, 99, 12345]) {
      const s = tv.buildTower(seed);
      const n = s.cabinet.length + s.trim.length + s.chrome.length;
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(3000);
      expect(n, `seed ${seed}`).toBeLessThanOrEqual(15000);
    }
  });

  it("uses whole-number positions, sensible shades and real TVs", () => {
    for (const v of all) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(v[3], key(v)).toBeGreaterThan(0);
      expect(v[3], key(v)).toBeLessThanOrEqual(1);
      expect(Number.isInteger(v[4]) && v[4] >= 0 && v[4] < t.tvs.length, key(v)).toBe(true);
    }
    for (const x of t.tvs) {
      expect(x.palette).toBeGreaterThanOrEqual(0);
      expect(x.palette).toBeLessThan(tv.PALETTES.length);
    }
  });

  it("no two voxels share a place", () => {
    const seen = new Set<string>();
    for (const v of all) {
      expect(seen.has(key(v)), key(v)).toBe(false);
      seen.add(key(v));
    }
  });

  it("stacks 15 TVs in rows of 1, 1, 3, 3, 4, 3 from the top, each row on the one below", () => {
    expect(tv.ROWS).toEqual([1, 1, 3, 3, 4, 3]);
    expect(t.tvs).toHaveLength(15);
    t.tvs.forEach((x, i) => expect(x.index).toBe(i));
    const rows = tv.ROWS.map((_, r) => t.tvs.filter((x) => x.row === r));
    expect(rows.map((r) => r.length)).toEqual([1, 1, 3, 3, 4, 3]);
    // the bottom row stands on the ground (y = 0); every other row sits on the one below it
    for (const x of rows[5]) expect(x.y0).toBe(0);
    for (let r = 0; r < 5; r++) {
      const below = Math.max(...rows[r + 1].map((x) => x.y0 + x.h));
      for (const x of rows[r]) expect(x.y0, `row ${r}`).toBe(below);
    }
    // left to right within a row, and the top TV is index 0
    for (const row of rows)
      for (let i = 1; i < row.length; i++) expect(row[i].x0).toBeGreaterThan(row[i - 1].x0);
    expect(t.tvs[0].row).toBe(0);
  });

  it("is a narrow tower: about twice as tall as wide, the TVs not overlapping", () => {
    expect(t.width).toBeGreaterThanOrEqual(45);
    expect(t.width).toBeLessThanOrEqual(70);
    expect(t.height).toBeGreaterThanOrEqual(80);
    expect(t.height).toBeLessThanOrEqual(110);
    expect(t.height / t.width).toBeGreaterThan(1.3);
    const xs = all.map((v) => v[0]);
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBeLessThanOrEqual(t.width + 2);
    expect(Math.max(...all.map((v) => v[1])) + 1).toBeLessThanOrEqual(t.height);
    // roughly centred on x = 0
    expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThanOrEqual(6);
    for (let a = 0; a < t.tvs.length; a++)
      for (let b = a + 1; b < t.tvs.length; b++) {
        const p = t.tvs[a],
          q = t.tvs[b];
        const apart =
          p.x0 + p.w <= q.x0 || q.x0 + q.w <= p.x0 || p.y0 + p.h <= q.y0 || q.y0 + q.h <= p.y0;
        expect(apart, `TVs ${a} and ${b}`).toBe(true);
      }
  });

  it("varies the sets: seeded sizes, cabinet shades and styles, slightly uneven", () => {
    expect(new Set(t.tvs.map((x) => x.w)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(t.tvs.map((x) => x.palette)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(t.tvs.map((x) => x.style)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(t.tvs.map((x) => x.z0)).size).toBeGreaterThanOrEqual(2);
    // the main TV on top is the biggest screen
    const area = (x: TV) => x.screen.w * x.screen.h;
    for (const x of t.tvs.slice(1)) expect(area(t.tvs[0])).toBeGreaterThan(area(x));
  });

  it("each TV has a screen hole where its screen quad goes, framed by a bezel", () => {
    const at = new Map(all.map((v) => [key(v), v]));
    for (const x of t.tvs) {
      const s = x.screen;
      expect(s.w / s.h, `TV ${x.index}`).toBeGreaterThanOrEqual(0.9);
      expect(s.w / s.h, `TV ${x.index}`).toBeLessThanOrEqual(1.7);
      expect(s.w).toBeGreaterThanOrEqual(6);
      expect(s.h).toBeGreaterThanOrEqual(5);
      // the screen's cells lie inside the TV's front, with a border all round
      const cx0 = s.x - s.w / 2 + 0.5,
        cy0 = s.y - s.h / 2 + 0.5;
      expect(Number.isInteger(cx0) && Number.isInteger(cy0)).toBe(true);
      expect(cx0).toBeGreaterThanOrEqual(x.x0 + 1);
      expect(cx0 + s.w - 1).toBeLessThanOrEqual(x.x0 + x.w - 2);
      expect(cy0).toBeGreaterThanOrEqual(x.y0 + 1);
      expect(cy0 + s.h - 1).toBeLessThanOrEqual(x.y0 + x.h - 2);
      // the screen sits just behind the front face
      expect(s.z).toBeCloseTo(x.z0 - 0.5, 9);
      // nothing in front of it inside the hole, nothing hidden right behind it
      for (const v of all) {
        if (v[0] < cx0 || v[0] > cx0 + s.w - 1 || v[1] < cy0 || v[1] > cy0 + s.h - 1) continue;
        expect(v[2] < s.z - 0.5 || v[2] > x.z0, `TV ${x.index}: ${key(v)}`).toBe(true);
      }
      // the bezel: voxels on the front face round the hole
      let framed = 0;
      for (let cx = cx0 - 1; cx <= cx0 + s.w; cx++) {
        if (at.has(key([cx, cy0 - 1, x.z0]))) framed++;
        if (at.has(key([cx, cy0 + s.h, x.z0]))) framed++;
      }
      expect(framed, `TV ${x.index}`).toBeGreaterThan(s.w * 1.5);
    }
  });

  it("the top TV wears an antenna whose tip is the stack's highest point", () => {
    const main = t.tvs[0];
    expect(main.antenna).not.toBeNull();
    const tip = main.antenna!.tip;
    expect(t.top).toEqual(tip);
    expect(tip[1]).toBeGreaterThan(main.y0 + main.h + 4);
    expect(tip[1]).toBe(Math.max(...all.map((v) => v[1])));
    expect(all.some((v) => key(v) === key(tip))).toBe(true);
  });

  it("keeps only voxels that can be seen from the front, the sides or above", () => {
    const occupied = new Set(all.map(key));
    for (const v of all) {
      const open = [
        [0, 0, 1],
        [0, 1, 0],
        [1, 0, 0],
        [-1, 0, 0],
      ].some(([dx, dy, dz]) => !occupied.has(key([v[0] + dx, v[1] + dy, v[2] + dz])));
      expect(open, key(v)).toBe(true);
    }
  });
});
