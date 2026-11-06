// Halo Rings (spec: docs/superpowers/specs/2026-11-06-m6-halo-rings-design.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Halo Rings template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      mainColor: "#8fe8ff",
      accentColor: "#4f7bff",
      intensity: 1,
      spectrumStyle: "dots",
      ringShape: "circle",
      spin: 100,
      scaleOnBeat: true,
      shakeOnBeat: true,
      showBackground: false,
      backgroundBlur: 40,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 4000,
      spectrumBoost: "2",
      bandCount: 100,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "spectrumStyle")).toMatchObject({
      options: [
        { value: "dots", label: "Dots" },
        { value: "bars", label: "Bars" },
        { value: "line", label: "Line" },
      ],
    });
    expect(t.variables.find((v) => v.id === "ringShape")).toMatchObject({
      options: [
        { value: "circle", label: "Circle" },
        { value: "rounded", label: "Rounded square" },
      ],
    });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      [
        "Effects",
        [
          "intensity",
          "spectrumStyle",
          "ringShape",
          "spin",
          "scaleOnBeat",
          "shakeOnBeat",
          "showBackground",
          "backgroundBlur",
        ],
      ],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "spectrumStyle",
      "ringShape",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#8fe8ff", accentColor: "#4f7bff" }, "presets/original.jpg"],
      ["Ember", { mainColor: "#ffb35c", accentColor: "#ff4a3d" }, "presets/ember.jpg"],
      ["Aurora", { mainColor: "#7dffb0", accentColor: "#a46bff" }, "presets/aurora.jpg"],
      ["Rose", { mainColor: "#ffd1dc", accentColor: "#ff7aa8" }, "presets/rose.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, titles fit the centre", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/halo-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    // long titles wrap onto two lines, the artist shrinks with the title, and nothing can be
    // wider than the space inside the inner ring (scaled down past the smallest size)
    expect(html).toContain("var TITLE_SAFE = 440");
    expect(html).toContain("var TITLE_LINES = 2");
    expect(html).toContain("var ARTIST_RATIO = 0.6");
    expect(html).toContain("var TITLE_FLOOR = 12");
    expect(html).toContain('"scale(" + (TITLE_SAFE / ');
  });
});
