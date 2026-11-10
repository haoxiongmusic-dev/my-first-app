// Late Show's television (bezel and cabinet) is built from voxels by
// templates/late-show/assets/tv-voxels.js, plain browser JavaScript that loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type Screen = { halfW: number; halfH: number; radius: number; z: number; rim: number };
type TV = { bezel: Voxel[]; cabinet: Voxel[]; led: Voxel[]; screen: Screen };
const require = createRequire(import.meta.url);
const tv = require("../../templates/late-show/assets/tv-voxels.js") as {
  buildTV: () => TV;
  SHADES: Record<number, number>;
  insideOpening: (x: number, y: number) => boolean;
};

const t = tv.buildTV();
const all = [...t.bezel, ...t.cabinet, ...t.led];
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;

describe("Late Show TV voxels", () => {
  it("is the same every time", () => {
    expect(tv.buildTV()).toEqual(t);
  });

  it("has a sensible size (at most 15,000 voxels)", () => {
    expect(all.length).toBeGreaterThanOrEqual(5000);
    expect(all.length).toBeLessThanOrEqual(15000);
    expect(t.led.length).toBeGreaterThan(0);
    expect(t.led.length).toBeLessThanOrEqual(12);
  });

  it("uses whole-number positions and only known shades", () => {
    const shades = Object.keys(tv.SHADES).map(Number);
    for (const v of all) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(shades, key(v)).toContain(v[3]);
      expect(tv.SHADES[v[3]]).toBeGreaterThan(0);
      expect(tv.SHADES[v[3]]).toBeLessThanOrEqual(1);
    }
  });

  it("no two voxels share a place", () => {
    const seen = new Set<string>();
    for (const v of all) {
      expect(seen.has(key(v)), key(v)).toBe(false);
      seen.add(key(v));
    }
  });

  it("leaves a 16:9 hole where the screen goes", () => {
    const s = t.screen;
    expect(s.halfW / s.halfH).toBeCloseTo(16 / 9, 1);
    // nothing at all inside the opening
    for (const v of all) expect(tv.insideOpening(v[0], v[1]), key(v)).toBe(false);
    // its centre and corners (just inside the rounding) are open
    expect(tv.insideOpening(0, 0)).toBe(true);
    expect(tv.insideOpening(s.halfW - 3, s.halfH - 3)).toBe(true);
    expect(tv.insideOpening(s.halfW + 1, 0)).toBe(false);
    // the corners are rounded
    expect(tv.insideOpening(s.halfW - 0.5, s.halfH - 0.5)).toBe(false);
  });

  it("closes the frame all the way round the opening", () => {
    const s = t.screen;
    const bezel = new Set(t.bezel.map((v) => `${v[0]},${v[1]}`));
    for (let x = -Math.floor(s.halfW); x <= Math.floor(s.halfW); x++) {
      expect(bezel.has(`${x},${Math.ceil(s.halfH)}`), `top ${x}`).toBe(true);
      expect(bezel.has(`${x},${-Math.ceil(s.halfH)}`), `bottom ${x}`).toBe(true);
    }
    for (let y = -Math.floor(s.halfH); y <= Math.floor(s.halfH); y++) {
      expect(bezel.has(`${Math.ceil(s.halfW)},${y}`), `right ${y}`).toBe(true);
      expect(bezel.has(`${-Math.ceil(s.halfW)},${y}`), `left ${y}`).toBe(true);
    }
  });

  it("is a thick bezel with a bevel down to the screen, the cabinet set back behind it", () => {
    // the face is at z = 0, the front of the bezel
    const front = 0;
    expect(Math.max(...t.bezel.map((v) => v[2]))).toBe(front);
    const atDepth = (z: number) => t.bezel.filter((v) => v[2] === z).length;
    for (let z = -12; z <= 1; z++)
      if (z !== 0) expect(atDepth(0), `z ${z}`).toBeGreaterThan(atDepth(z));
    const zs = new Set(t.bezel.map((v) => v[2]));
    // a stepped bevel: several depths between the front and the tunnel round the screen
    for (let z = t.screen.rim; z <= 0; z++) expect(zs.has(z), `z ${z}`).toBe(true);
    // the tunnel walls reach behind the screen's edge, so its edge never shows
    expect(Math.min(...t.bezel.map((v) => v[2]))).toBeLessThan(t.screen.z);
    // the cabinet is behind the bezel's front and darker
    expect(Math.max(...t.cabinet.map((v) => v[2]))).toBeLessThan(front);
    const avg = (list: Voxel[]) => list.reduce((s, v) => s + tv.SHADES[v[3]], 0) / list.length;
    expect(avg(t.cabinet)).toBeLessThan(avg(t.bezel) * 0.6);
    // the bezel is wider than the opening on every side
    const xs = t.bezel.map((v) => v[0]);
    const ys = t.bezel.map((v) => v[1]);
    expect(Math.max(...xs) - t.screen.halfW).toBeGreaterThanOrEqual(8);
    expect(Math.max(...ys) - t.screen.halfH).toBeGreaterThanOrEqual(6);
  });

  it("is mirror-symmetric left to right (the power light aside)", () => {
    const ledColumns = new Set(t.led.map((v) => `${v[0]},${v[1]}`));
    for (const part of [t.bezel, t.cabinet]) {
      const set = new Set(part.map(key));
      for (const v of part) {
        if (ledColumns.has(`${-v[0]},${v[1]}`)) continue;
        expect(set.has(key([-v[0], v[1], v[2]])), key(v)).toBe(true);
      }
    }
  });

  it("keeps only voxels that can be seen from the front or the side", () => {
    const set = new Set(all.map(key));
    for (const v of all) {
      const [x, y, z] = v;
      const hidden =
        set.has(key([x, y, z + 1])) &&
        set.has(key([x + 1, y, z])) &&
        set.has(key([x - 1, y, z])) &&
        set.has(key([x, y + 1, z])) &&
        set.has(key([x, y - 1, z]));
      expect(hidden, key(v)).toBe(false);
    }
  });

  it("puts the power light on the bottom bezel, in front", () => {
    for (const v of t.led) {
      expect(v[1]).toBeLessThan(-t.screen.halfH);
      expect(v[0]).toBeGreaterThan(0);
      expect(v[2]).toBeGreaterThanOrEqual(0);
    }
  });
});
