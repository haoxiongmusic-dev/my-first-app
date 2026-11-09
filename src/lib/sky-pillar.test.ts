// Sky Pillar (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.1).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "sky-pillar");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Sky Pillar template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Sky Pillar");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "EB Garamond",
      mainColor: "#7fb8ff",
      accentColor: "#2a5cff",
      intensity: 1,
      scaleOnBeat: true,
      showFigure: true,
      fogAmount: 60,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
      bandCount: 55,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    expect(t.variables.find((v) => v.id === "fogAmount")).toMatchObject({
      type: "number",
      min: 0,
      max: 100,
      unit: "%",
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "scaleOnBeat", "showFigure", "fogAmount"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "fogAmount",
      "showFigure",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("uses the usual font, beat range and boost options (the same as Halo Rings)", async () => {
    const t = await loadTemplate(dir);
    const halo = await loadTemplate(haloDir);
    for (const id of ["font", "beatRange", "spectrumBoost"]) {
      const mine = t.variables.find((v) => v.id === id) as { options?: unknown };
      const theirs = halo.variables.find((v) => v.id === id) as { options?: unknown };
      expect(mine.options, id).toEqual(theirs.options);
    }
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#7fb8ff", accentColor: "#2a5cff" }, "presets/original.jpg"],
      ["Crimson", { mainColor: "#ff7a7a", accentColor: "#c0182a" }, "presets/crimson.jpg"],
      ["Verdant", { mainColor: "#8dffb0", accentColor: "#18a04a" }, "presets/verdant.jpg"],
      ["Gold", { mainColor: "#ffd28a", accentColor: "#d0821c" }, "presets/gold.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, titles fit the frame", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/pillar-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    expect(html).toContain("V.trackGl(");
    // song-length elements get their duration from the job builder
    expect(html).toContain("data-song-length");
    // long titles wrap onto two lines, the artist shrinks with the title, and nothing can be
    // wider than the space (scaled down past the smallest size)
    expect(html).toContain("var TITLE_SAFE = 1400");
    expect(html).toContain("var TITLE_LINES = 2");
    expect(html).toContain('"scale(" + (TITLE_SAFE / ');
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
