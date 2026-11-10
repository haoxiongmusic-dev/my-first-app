// Moon Jelly's jellyfish are built from voxels by templates/moon-jelly/assets/jelly-voxels.js,
// plain browser JavaScript that loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type ChainVoxel = [number, number, number, number, number];
type Chain = { anchor: [number, number, number]; length: number; voxels: ChainVoxel[] };
type Jelly = {
  radius: number;
  height: number;
  bell: Voxel[];
  rim: Voxel[];
  gonads: Voxel[];
  tentacles: Chain[];
  arms: Chain[];
};
const require = createRequire(import.meta.url);
const vox = require("../../templates/moon-jelly/assets/jelly-voxels.js") as {
  MAX_VOXELS: number;
  RADIUS: Record<string, number>;
  SHADES: Record<number, string>;
  buildJelly: (tier: string, seed: number) => Jelly;
  countVoxels: (jelly: Jelly) => number;
};
const motion = require("../../templates/moon-jelly/assets/jelly-motion.js") as {
  SLOTS: { tier: string }[];
};

const front = vox.buildJelly("front", 1);
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;
const radial = (v: number[]) => Math.hypot(v[0], v[2]);
const allOf = (j: Jelly): number[][] => [
  ...j.bell,
  ...j.rim,
  ...j.gonads,
  ...j.tentacles.flatMap((c) => c.voxels),
  ...j.arms.flatMap((c) => c.voxels),
];

describe("Moon Jelly voxels", () => {
  it("is the same every time for a seed; seeds vary the details", () => {
    expect(vox.buildJelly("front", 1)).toEqual(front);
    const other = vox.buildJelly("front", 2);
    expect(other.bell).toEqual(front.bell); // the shared bell model …
    expect(other.tentacles.map((c) => c.length)).not.toEqual(front.tentacles.map((c) => c.length));
  });

  it("keeps every jellyfish on screen at most 15,000 voxels in all", () => {
    expect(vox.MAX_VOXELS).toBe(15000);
    expect(motion.SLOTS).toHaveLength(14);
    const total = motion.SLOTS.reduce(
      (sum, s, i) => sum + vox.countVoxels(vox.buildJelly(s.tier, 100 + i)),
      0,
    );
    expect(total).toBeLessThanOrEqual(vox.MAX_VOXELS);
    expect(total).toBeGreaterThan(8000);
    // the big front ones have enough voxels for a clear shape, the far ones fewer
    expect(vox.countVoxels(front)).toBeGreaterThan(1500);
    expect(vox.countVoxels(vox.buildJelly("far", 1))).toBeLessThan(vox.countVoxels(front) / 3);
    expect(vox.RADIUS.front).toBeGreaterThan(vox.RADIUS.mid);
    expect(vox.RADIUS.mid).toBeGreaterThan(vox.RADIUS.far);
  });

  it("uses whole-number positions, known shades and no doubled voxels", () => {
    for (const tier of ["front", "mid", "far"]) {
      const j = vox.buildJelly(tier, 7);
      const shades = Object.keys(vox.SHADES).map(Number);
      for (const v of allOf(j)) {
        expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
        expect(shades, key(v)).toContain(v[3]);
      }
      const solid = [...j.bell, ...j.rim, ...j.gonads].map(key);
      expect(new Set(solid).size).toBe(solid.length);
    }
  });

  it("has a wide, hollow domed bell, open underneath", () => {
    const R = front.radius;
    const H = front.height;
    expect(H).toBeLessThan(R); // wide, not tall
    expect(H).toBeGreaterThan(R * 0.4);
    const xs = front.bell.map((v) => v[0]);
    const ys = front.bell.map((v) => v[1]);
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBeGreaterThanOrEqual(2 * R);
    expect(Math.max(...ys)).toBe(H);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1);
    // hollow: nothing deep inside the dome, and the underside is open
    const set = new Set(front.bell.map(key));
    expect(set.has("0,2,0")).toBe(false);
    expect(set.has(`0,${Math.round(H / 2)},0`)).toBe(false);
    expect(set.has("0,0,0")).toBe(false);
    // edge voxels (the main colour) sit round the outside, body voxels over the top
    const edge = front.bell.filter((v) => v[3] === 3);
    const body = front.bell.filter((v) => v[3] === 1 || v[3] === 2);
    expect(edge.length).toBeGreaterThan(50);
    expect(body.length).toBeGreaterThan(150);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean(edge.map(radial))).toBeGreaterThan(mean(body.map(radial)));
  });

  it("has a frilled rim ring just under the bell's edge", () => {
    const R = front.radius;
    expect(front.rim.length).toBeGreaterThan(60);
    for (const v of front.rim) {
      expect(v[1]).toBeLessThan(0);
      expect(v[1]).toBeGreaterThanOrEqual(-4);
      expect(radial(v)).toBeGreaterThan(R - 2.5);
      expect(radial(v)).toBeLessThan(R + 2);
    }
    // frilled: the rim hangs to different depths round the ring
    expect(new Set(front.rim.map((v) => v[1])).size).toBeGreaterThanOrEqual(2);
  });

  it("glows inside: four gonad rings within the dome", () => {
    expect(front.gonads.length).toBeGreaterThan(20);
    const quadrants = new Set(front.gonads.map((v) => `${Math.sign(v[0])}${Math.sign(v[2])}`));
    expect(quadrants.size).toBeGreaterThanOrEqual(4);
    for (const v of front.gonads) {
      expect(radial(v)).toBeLessThan(front.radius * 0.75);
      expect(v[1]).toBeGreaterThan(0);
      expect(v[1]).toBeLessThan(front.height);
    }
  });

  it("hangs long thin tentacles from the rim as chains, straight down at rest", () => {
    const R = front.radius;
    expect(front.tentacles.length).toBeGreaterThanOrEqual(12);
    for (const c of front.tentacles) {
      expect(radial(c.anchor)).toBeGreaterThan(R - 2);
      expect(c.length).toBeGreaterThanOrEqual(Math.round(1.3 * R));
      expect(c.length).toBeLessThanOrEqual(Math.round(2.3 * R));
      expect(c.voxels).toHaveLength(c.length); // one voxel per link: thin
      c.voxels.forEach((v, k) => {
        expect(v[4]).toBe(k);
        expect(v[0]).toBe(c.anchor[0]);
        expect(v[2]).toBe(c.anchor[2]);
        expect(v[1]).toBe(c.anchor[1] - k);
      });
    }
  });

  it("hangs four frilly oral arms from the middle", () => {
    expect(front.arms).toHaveLength(4);
    for (const c of front.arms) {
      expect(radial(c.anchor)).toBeLessThan(front.radius * 0.4);
      expect(c.length).toBeGreaterThan(front.radius * 0.7);
      // each link is a frilly cross-section, wider in the middle than at the ends
      const width = (k: number) => c.voxels.filter((v) => v[4] === k).length;
      expect(width(Math.floor(c.length / 2))).toBeGreaterThan(width(0));
      expect(Math.max(...c.voxels.map((v) => v[4]))).toBe(c.length - 1);
      for (const v of c.voxels) expect(v[1]).toBe(c.anchor[1] - v[4]);
    }
  });
});
