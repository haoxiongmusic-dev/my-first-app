// Hyper Tunnel's chrome robot is built from voxels by
// templates/hyper-tunnel/assets/robot-voxels.js, plain browser JavaScript that loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type Point = [number, number, number];
type Robot = {
  head: Voxel[];
  visor: Voxel[];
  cable: Voxel[];
  torso: Voxel[];
  armL: Voxel[];
  armR: Voxel[];
  headPivot: Point;
  shoulderL: Point;
  shoulderR: Point;
};
const require = createRequire(import.meta.url);
const robot = require("../../templates/hyper-tunnel/assets/robot-voxels.js") as {
  MAX_VOXELS: number;
  SHADES: Record<number, number>;
  buildRobot: () => Robot;
};

const r = robot.buildRobot();
const parts = {
  head: r.head,
  visor: r.visor,
  cable: r.cable,
  torso: r.torso,
  armL: r.armL,
  armR: r.armR,
};
const all = Object.values(parts).flat();
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;
const xs = (p: Voxel[]) => p.map((v) => v[0]);
const ys = (p: Voxel[]) => p.map((v) => v[1]);
const zs = (p: Voxel[]) => p.map((v) => v[2]);
const min = (a: number[]) => Math.min(...a);
const max = (a: number[]) => Math.max(...a);

describe("Hyper Tunnel robot voxels", () => {
  it("is the same every time", () => {
    expect(robot.buildRobot()).toEqual(r);
  });

  it("has a sensible size (at most 15,000 voxels in all)", () => {
    expect(robot.MAX_VOXELS).toBe(15000);
    expect(all.length).toBeGreaterThanOrEqual(6000);
    expect(all.length).toBeLessThanOrEqual(robot.MAX_VOXELS);
    for (const [name, p] of Object.entries(parts)) expect(p.length, name).toBeGreaterThan(20);
  });

  it("uses whole-number positions and only known shades", () => {
    const shades = Object.keys(robot.SHADES).map(Number);
    for (const v of all) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(shades, key(v)).toContain(v[3]);
    }
    for (const s of Object.values(robot.SHADES)) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("no two voxels share a place", () => {
    const seen = new Set<string>();
    for (const v of all) {
      expect(seen.has(key(v)), key(v)).toBe(false);
      seen.add(key(v));
    }
  });

  it("keeps only voxels that can be seen (from the front, the sides, above or below)", () => {
    const occupied = new Set(all.map(key));
    for (const v of all) {
      const open = [
        [0, 0, 1],
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
      ].some(([dx, dy, dz]) => !occupied.has(key([v[0] + dx, v[1] + dy, v[2] + dz])));
      expect(open, key(v)).toBe(true);
    }
  });

  it("is waist up: a big head on a neck above a broad torso", () => {
    // the head (with its headset) is chunky: at least 24 voxels across and 22 tall
    expect(max(xs(r.head)) - min(xs(r.head)) + 1).toBeGreaterThanOrEqual(24);
    expect(max(ys(r.head)) - min(ys(r.head)) + 1).toBeGreaterThanOrEqual(22);
    // it sits on top: its lowest voxel near the neck's top, the torso's top below the headset
    expect(min(ys(r.head))).toBeGreaterThan(max(ys(r.torso)) - 6);
    expect(r.headPivot[1]).toBeGreaterThanOrEqual(min(ys(r.head)) - 2);
    expect(r.headPivot[1]).toBeLessThanOrEqual(max(ys(r.torso)) + 2);
    // the torso is broad (shoulders) and runs down past the waist
    expect(max(xs(r.torso)) - min(xs(r.torso)) + 1).toBeGreaterThanOrEqual(36);
    expect(max(ys(r.head)) - min(ys(r.torso))).toBeGreaterThanOrEqual(75);
    // roughly centred on x = 0
    expect(Math.abs(max(xs(r.torso)) + min(xs(r.torso)))).toBeLessThanOrEqual(1);
  });

  it("wears a chunky headset whose visor sits in front of the face", () => {
    const front = max(zs(r.head.filter((v) => Math.abs(v[0]) <= 4 && v[1] < min(ys(r.visor)) - 3)));
    expect(min(zs(r.visor))).toBeGreaterThan(front + 2);
    // the visor is a wide panel across the head's upper half
    expect(max(xs(r.visor)) - min(xs(r.visor)) + 1).toBeGreaterThanOrEqual(18);
    expect(max(ys(r.visor)) - min(ys(r.visor)) + 1).toBeGreaterThanOrEqual(6);
    expect(min(ys(r.visor))).toBeGreaterThan(r.headPivot[1] + 6);
    // nothing of the head in front of the visor
    const occupied = new Set(r.head.map(key));
    for (const v of r.visor) {
      for (let z = v[2] + 1; z < v[2] + 6; z++)
        expect(occupied.has(key([v[0], v[1], z])), key(v)).toBe(false);
    }
    // the visor has scan lines: rows of two brightnesses
    expect(new Set(r.visor.map((v) => v[3])).size).toBeGreaterThanOrEqual(2);
  });

  it("the headset's cable leaves its side and hangs down behind the shoulder", () => {
    const top = r.cable.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(Math.abs(top[0])).toBeGreaterThanOrEqual(12);
    expect(top[1]).toBeGreaterThanOrEqual(min(ys(r.visor)) - 4);
    expect(max(ys(r.cable)) - min(ys(r.cable))).toBeGreaterThanOrEqual(25);
    // it ends behind the torso's front
    const low = r.cable.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(low[2]).toBeLessThan(0);
  });

  it("has a segmented chest plate: grooves in several rows down the front", () => {
    const frontSeams = r.torso.filter((v) => v[3] === 2 && v[2] >= 4);
    expect(frontSeams.length).toBeGreaterThan(60);
    const rows = new Set(frontSeams.filter((v) => Math.abs(v[0]) >= 3).map((v) => v[1]));
    expect(rows.size).toBeGreaterThanOrEqual(3);
  });

  it("holds its arms out at its sides, with open hands", () => {
    // the arms are mirror images of each other
    const left = new Set(r.armL.map((v) => `${-v[0]},${v[1]},${v[2]},${v[3]}`));
    expect(r.armR.length).toBe(r.armL.length);
    for (const v of r.armR) expect(left.has(`${v[0]},${v[1]},${v[2]},${v[3]}`), key(v)).toBe(true);
    expect(r.shoulderL).toEqual([-r.shoulderR[0], r.shoulderR[1], r.shoulderR[2]]);
    // out at the sides, well past the torso
    expect(max(xs(r.armR))).toBeGreaterThan(max(xs(r.torso)) + 25);
    expect(min(xs(r.armL))).toBeLessThan(min(xs(r.torso)) - 25);
    // the hand, out at the end, reaches up to about shoulder height
    const outer = r.armR.filter((v) => v[0] >= max(xs(r.armR)) - 12);
    expect(max(ys(outer))).toBeGreaterThan(r.shoulderR[1] - 6);
    // open: fingers with gaps between them (rows across the fingers alternate filled and empty)
    const fingerRow = max(ys(outer)) - 2;
    const across = new Set(outer.filter((v) => v[1] === fingerRow).map((v) => v[0]));
    let gaps = 0;
    for (let x = min([...across]); x <= max([...across]); x++) if (!across.has(x)) gaps++;
    expect(gaps).toBeGreaterThanOrEqual(2);
    // the shoulder pivot is at the top of the arm, by the torso
    expect(r.shoulderR[0]).toBeGreaterThan(10);
    expect(r.shoulderR[0]).toBeLessThan(max(xs(r.torso)) + 6);
  });
});
