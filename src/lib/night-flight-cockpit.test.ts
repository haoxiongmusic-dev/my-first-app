// Night Flight's cockpit is built from voxels by
// templates/night-flight/assets/cockpit-voxels.js, plain browser JavaScript that loads as CommonJS.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Voxel = [number, number, number, number];
type Gauge = { x: number; y: number; z: number; radius: number };
type Cockpit = {
  struts: Voxel[];
  dash: Voxel[];
  ticks: Voxel[];
  buttons: Voxel[];
  meter: Voxel[];
  needles: Voxel[][];
  gauges: Gauge[];
  screen: { x: number; y: number; z: number; half: number };
  lcd: { x: number; y: number; z: number; halfW: number; halfH: number };
};
const require = createRequire(import.meta.url);
const cp = require("../../templates/night-flight/assets/cockpit-voxels.js") as {
  buildCockpit: () => Cockpit;
  dashTop: (x: number) => number;
  SHADES: Record<number, number>;
  LIGHTS: Record<number, string>;
  NEEDLE_SCALE: number;
};

const c = cp.buildCockpit();
const lit = [...c.ticks, ...c.buttons, ...c.meter];
const all = [...c.struts, ...c.dash, ...lit];
const key = (v: number[]) => `${v[0]},${v[1]},${v[2]}`;
const left = c.struts.filter((v) => v[0] < 0);
const right = c.struts.filter((v) => v[0] > 0);

describe("Night Flight cockpit voxels", () => {
  it("is the same every time", () => {
    expect(cp.buildCockpit()).toEqual(c);
  });

  it("has a sensible size (at most 15,000 voxels)", () => {
    const needles = c.needles.reduce((n, list) => n + list.length, 0);
    expect(all.length + needles).toBeGreaterThanOrEqual(5000);
    expect(all.length + needles).toBeLessThanOrEqual(15000);
    expect(c.struts.length).toBeGreaterThan(1000);
    expect(c.dash.length).toBeGreaterThan(3000);
    expect(c.buttons.length).toBeGreaterThan(10);
    expect(c.buttons.length).toBeLessThanOrEqual(120);
  });

  it("uses whole-number positions and only known shades and lights", () => {
    const shades = Object.keys(cp.SHADES).map(Number);
    for (const v of [...c.struts, ...c.dash]) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(shades, key(v)).toContain(v[3]);
      expect(cp.SHADES[v[3]]).toBeGreaterThan(0);
      expect(cp.SHADES[v[3]]).toBeLessThanOrEqual(1);
    }
    const lights = Object.keys(cp.LIGHTS).map(Number);
    for (const v of lit) {
      expect(v.slice(0, 3).every(Number.isInteger), key(v)).toBe(true);
      expect(lights, key(v)).toContain(v[3]);
    }
  });

  it("no two voxels share a place", () => {
    const seen = new Set<string>();
    for (const v of all) {
      expect(seen.has(key(v)), key(v)).toBe(false);
      seen.add(key(v));
    }
  });

  it("keeps only voxels that can be seen from the front, the top or the side", () => {
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

  it("two thick struts make a V from the dashboard's centre out past the top corners", () => {
    expect(left.length).toBe(right.length);
    expect(left.length + right.length).toBe(c.struts.length);
    for (const side of [left, right]) {
      const lowest = Math.min(...side.map((v) => v[1]));
      const base = side.filter((v) => v[1] === lowest);
      // they stand on the dashboard near the centre ...
      for (const v of base) expect(Math.abs(v[0])).toBeLessThan(25);
      expect(lowest).toBeLessThanOrEqual(cp.dashTop(0) + 3);
      // ... and leave the frame (80 × 45 units at the struts' depth, less nearer) at the top corners
      expect(Math.max(...side.map((v) => Math.abs(v[0])))).toBeGreaterThan(75);
      expect(Math.max(...side.map((v) => v[1]))).toBeGreaterThan(40);
      // rising outward: higher up means further out
      const at = (y: number) => {
        const row = side.filter((v) => v[1] === y).map((v) => Math.abs(v[0]));
        return row.reduce((s, x) => s + x, 0) / row.length;
      };
      expect(at(30)).toBeGreaterThan(at(0) + 20);
      expect(at(0)).toBeGreaterThan(at(-15) + 10);
      // thick: about 9 voxels across
      const row = side.filter((v) => v[1] === 10).map((v) => v[0]);
      expect(Math.max(...row) - Math.min(...row)).toBeGreaterThanOrEqual(10);
      // the struts come toward you as they rise (they arch over the pilot)
      const zAt = (y: number) => Math.max(...side.filter((v) => v[1] === y).map((v) => v[2]));
      expect(zAt(40)).toBeGreaterThan(zAt(-15) + 8);
    }
  });

  it("the struts are mirror images", () => {
    const set = new Set(c.struts.map(key));
    for (const v of c.struts) expect(set.has(key([-v[0], v[1], v[2]])), key(v)).toBe(true);
  });

  it("a dark dashboard runs across the bottom, in front of the struts", () => {
    const xs = c.dash.map((v) => v[0]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-78);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(78);
    // its top: highest in the middle, curving down to the sides, well below the horizon
    expect(cp.dashTop(0)).toBeGreaterThan(cp.dashTop(70));
    expect(cp.dashTop(0)).toBeLessThan(-15);
    expect(Math.max(...c.dash.map((v) => v[1]))).toBe(cp.dashTop(0));
    // its face is nearer than the struts' foot
    const face = Math.max(...c.dash.map((v) => v[2]));
    const strutFoot = Math.min(...c.struts.map((v) => v[2]));
    expect(face).toBeGreaterThan(strutFoot + 5);
    // dark: darker on average than the struts
    const avg = (list: Voxel[]) => list.reduce((s, v) => s + cp.SHADES[v[3]], 0) / list.length;
    expect(avg(c.dash)).toBeLessThan(0.4);
    expect(avg(c.struts)).toBeLessThan(0.5);
    // the centre cluster (screen and gauges) is symmetric
    const set = new Set(c.dash.map(key));
    for (const v of c.dash.filter((v) => Math.abs(v[0]) <= 30)) {
      expect(set.has(key([-v[0], v[1], v[2]])), key(v)).toBe(true);
    }
  });

  it("leaves a framed opening for the cover screen in the dashboard's centre", () => {
    const s = c.screen;
    expect(s.x).toBe(0);
    expect(s.half).toBeGreaterThanOrEqual(5);
    expect(s.y + s.half).toBeLessThan(cp.dashTop(0));
    // nothing in front of the screen inside its opening
    for (const v of all) {
      const inside = Math.abs(v[0] - s.x) < s.half && Math.abs(v[1] - s.y) < s.half;
      if (inside) expect(v[2], key(v)).toBeLessThan(s.z);
    }
    // a raised frame round it, nearer than the screen
    const frame = c.dash.filter(
      (v) =>
        Math.max(Math.abs(v[0] - s.x), Math.abs(v[1] - s.y)) <= s.half + 2 &&
        Math.max(Math.abs(v[0] - s.x), Math.abs(v[1] - s.y)) >= s.half,
    );
    expect(frame.length).toBeGreaterThan(40);
    expect(Math.max(...frame.map((v) => v[2]))).toBeGreaterThan(s.z);
  });

  it("has two gauges with housings, lit ticks and needles shorter than the dial", () => {
    expect(c.gauges).toHaveLength(2);
    expect(c.needles).toHaveLength(2);
    const [g0, g1] = c.gauges;
    expect(g0.x).toBe(-g1.x);
    expect(g0.y).toBe(g1.y);
    for (const g of c.gauges) {
      expect(g.y).toBeLessThan(cp.dashTop(g.x));
      // a raised housing ring round the dial
      const ring = c.dash.filter((v) => {
        const r = Math.hypot(v[0] - g.x, v[1] - g.y);
        return r >= g.radius - 0.5 && r <= g.radius + 1.5 && v[2] > g.z;
      });
      expect(ring.length).toBeGreaterThan(20);
      // ticks inside the dial
      const ticks = c.ticks.filter((v) => Math.hypot(v[0] - g.x, v[1] - g.y) < g.radius);
      expect(ticks.length).toBeGreaterThanOrEqual(5);
    }
    for (const needle of c.needles) {
      expect(needle.length).toBeGreaterThan(3);
      for (const v of needle) {
        expect(v[0]).toBe(0);
        expect(v[1]).toBeGreaterThanOrEqual(0);
        expect(v[1] * cp.NEEDLE_SCALE).toBeLessThan(c.gauges[0].radius - 0.5);
      }
    }
  });

  it("puts the lit buttons, the level meter and the timer's panel on the dashboard", () => {
    for (const v of [...c.buttons, ...c.meter]) {
      expect(v[1], key(v)).toBeLessThan(cp.dashTop(v[0]));
      expect(Math.abs(v[0]), key(v)).toBeGreaterThan(30);
    }
    expect(c.meter.length).toBeGreaterThanOrEqual(8);
    expect(c.meter.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < c.meter.length; i++)
      expect(c.meter[i][0]).toBeGreaterThan(c.meter[i - 1][0]);
    const l = c.lcd;
    expect(l.halfW).toBeGreaterThan(l.halfH * 3);
    expect(l.y + l.halfH).toBeLessThan(cp.dashTop(l.x));
    expect(Math.abs(l.x)).toBeGreaterThan(30);
  });
});
