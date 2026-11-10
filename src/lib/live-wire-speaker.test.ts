// Live Wire's loudspeaker is built from voxels by
// templates/live-wire/assets/speaker-voxels.js, plain browser JavaScript that loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type Speaker = {
  rim: Voxel[];
  edge: Voxel[];
  screws: Voxel[];
  plugs: Voxel[];
  surround: Voxel[];
  cone: Voxel[];
  cap: Voxel[];
};
const require = createRequire(import.meta.url);
const sp = require("../../templates/live-wire/assets/speaker-voxels.js") as {
  buildSpeaker: () => Speaker;
  R_OUT: number;
  RIM_IN: number;
  CONE_OUT: number;
  CAP_R: number;
  PLUG_ANGLES: number[];
  PLUG_REACH: number;
};

const s = sp.buildSpeaker();
const still = [...s.rim, ...s.edge, ...s.screws, ...s.plugs];
const moving = [...s.surround, ...s.cone, ...s.cap];
const all = [...still, ...moving];
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;
const radius = (v: number[]) => Math.hypot(v[0], v[1]);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const shadeOf = (list: Voxel[]) => mean(list.map((v) => v[3]));

describe("Live Wire speaker voxels", () => {
  it("is the same every time", () => {
    expect(sp.buildSpeaker()).toEqual(s);
  });

  it("has a sensible size (at most 15,000 voxels)", () => {
    expect(all.length).toBeGreaterThanOrEqual(1500);
    expect(all.length).toBeLessThanOrEqual(15000);
    for (const part of Object.values(s)) expect(part.length).toBeGreaterThan(0);
  });

  it("uses whole-number positions and brightness shades in 0..1", () => {
    for (const v of all) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(v[3], key(v)).toBeGreaterThan(0);
      expect(v[3], key(v)).toBeLessThanOrEqual(1);
    }
  });

  it("no two voxels share a place", () => {
    const seen = new Set<string>();
    for (const v of all) {
      expect(seen.has(key(v)), key(v)).toBe(false);
      seen.add(key(v));
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

  it("is a round speaker about 40 voxels across, mirrored left to right", () => {
    const round = [...s.rim, ...s.edge, ...moving];
    expect(Math.max(...round.map(radius))).toBeLessThanOrEqual(sp.R_OUT);
    expect(Math.max(...round.map(radius))).toBeGreaterThan(sp.R_OUT - 1);
    expect(2 * sp.R_OUT).toBeGreaterThanOrEqual(36);
    expect(2 * sp.R_OUT).toBeLessThanOrEqual(46);
    const set = new Set(all.map(key));
    for (const v of all) expect(set.has(key([-v[0], v[1], v[2]])), key(v)).toBe(true);
  });

  it("parts in place: glowing edge outside a dark raised rim, then surround, cone and cap", () => {
    for (const v of s.edge) expect(radius(v), key(v)).toBeGreaterThan(sp.R_OUT - 1.01);
    for (const v of s.rim) {
      expect(radius(v), key(v)).toBeGreaterThan(sp.RIM_IN);
      expect(radius(v), key(v)).toBeLessThanOrEqual(sp.R_OUT - 1);
    }
    for (const v of s.surround) {
      expect(radius(v)).toBeGreaterThan(sp.CONE_OUT);
      expect(radius(v)).toBeLessThanOrEqual(sp.RIM_IN);
    }
    for (const v of s.cone) {
      expect(radius(v)).toBeGreaterThan(sp.CAP_R);
      expect(radius(v)).toBeLessThanOrEqual(sp.CONE_OUT);
    }
    for (const v of s.cap) expect(radius(v)).toBeLessThanOrEqual(sp.CAP_R);
    // the rim stands highest (bar the screws); the moving parts sit below it, so they can pump
    const rimTop = Math.max(...s.rim.map((v) => v[2]));
    expect(Math.max(...moving.map((v) => v[2]))).toBeLessThanOrEqual(rimTop - 2);
    expect(Math.max(...s.screws.map((v) => v[2]))).toBeGreaterThan(rimTop);
    for (const v of s.screws) expect(v[2]).toBeGreaterThanOrEqual(rimTop - 2);
  });

  it("the cone is a bowl of concentric voxel rings, deeper toward the middle", () => {
    const rings = new Map<number, Voxel[]>();
    for (const v of s.cone) {
      const r = Math.round(radius(v));
      rings.set(r, [...(rings.get(r) ?? []), v]);
    }
    expect(rings.size).toBeGreaterThanOrEqual(6);
    const tops = [...rings.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        return Math.max(...rings.get(r)!.map((v) => v[2]));
      });
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1]);
    expect(tops[tops.length - 1] - tops[0]).toBeGreaterThanOrEqual(4);
    // the dust cap domes up out of the bowl's floor
    const capTop = Math.max(...s.cap.map((v) => v[2]));
    expect(capTop).toBeGreaterThan(tops[0] + 1);
  });

  it("a bright brushed cone, a dark rim, a glossy black cap", () => {
    expect(shadeOf(s.cone)).toBeGreaterThan(0.6);
    expect(shadeOf(s.rim)).toBeLessThan(0.45);
    expect(shadeOf(s.cap)).toBeLessThan(0.3);
    expect(shadeOf(s.surround)).toBeLessThan(0.35);
    // brushed: the shade changes round each ring
    const ring = s.cone.filter((v) => Math.round(radius(v)) === 9);
    const sd = Math.sqrt(mean(ring.map((v) => (v[3] - shadeOf(ring)) ** 2)));
    expect(sd).toBeGreaterThan(0.03);
    // chrome: the rim has bright highlights as well as dark bands
    expect(Math.max(...s.rim.map((v) => v[3]))).toBeGreaterThan(0.6);
    expect(Math.min(...s.rim.map((v) => v[3]))).toBeLessThan(0.15);
    // the glossy cap catches the light at its upper left
    const bright = s.cap.filter((v) => v[3] > 0.5);
    expect(bright.length).toBeGreaterThan(0);
    for (const v of bright) expect(v[0] <= 0 && v[1] >= 0, key(v)).toBe(true);
  });

  it("has eight screws round the rim", () => {
    const angles = new Set(
      s.screws.map((v) => Math.round((Math.atan2(v[1], v[0]) * 180) / Math.PI / 45)),
    );
    // (±180° round to the same screw)
    angles.delete(-4);
    expect(angles.size).toBe(8);
    for (const v of s.screws) {
      expect(radius(v)).toBeGreaterThan(sp.RIM_IN);
      expect(radius(v)).toBeLessThan(sp.R_OUT - 1);
    }
  });

  it("has four cable plugs at the cable exits, reaching past the edge", () => {
    expect(sp.PLUG_ANGLES).toHaveLength(4);
    expect(sp.PLUG_REACH).toBeGreaterThan(sp.R_OUT);
    for (const deg of sp.PLUG_ANGLES) {
      const a = (deg * Math.PI) / 180;
      const near = s.plugs.filter((v) => {
        const along = v[0] * Math.cos(a) + v[1] * Math.sin(a);
        const across = -v[0] * Math.sin(a) + v[1] * Math.cos(a);
        return along > sp.R_OUT - 3 && Math.abs(across) <= 3.5;
      });
      expect(near.length, String(deg)).toBeGreaterThan(10);
      const reach = Math.max(...near.map((v) => v[0] * Math.cos(a) + v[1] * Math.sin(a)));
      expect(reach).toBeGreaterThan(sp.R_OUT + 1);
      expect(reach).toBeLessThanOrEqual(sp.PLUG_REACH + 0.5);
    }
  });
});
