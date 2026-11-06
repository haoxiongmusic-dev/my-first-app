// Prism Heart (spec: docs/superpowers/specs/2026-11-06-m6-prism-heart-design.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "prism-heart");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Prism Heart template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      mainColor: "#c38bff",
      accentColor: "#ff7ac8",
      intensity: 1,
      spin: 100,
      bandThickness: 50,
      noiseAmount: 0,
      showBackground: false,
      backgroundBlur: 60,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "1",
      bandCount: 50,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      [
        "Effects",
        ["intensity", "spin", "bandThickness", "noiseAmount", "showBackground", "backgroundBlur"],
      ],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "bandThickness",
      "noiseAmount",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#c38bff", accentColor: "#ff7ac8" }, "presets/original.jpg"],
      ["Amber", { mainColor: "#ffb547", accentColor: "#ff6a2b" }, "presets/amber.jpg"],
      ["Ice", { mainColor: "#8ee9ff", accentColor: "#5b7cff" }, "presets/ice.jpg"],
      ["Opal", { mainColor: "#9dffd9", accentColor: "#ff9df0" }, "presets/opal.jpg"],
    ]);
  });

  it("follows the template and three.js rules", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/prism-motion.js"');
    expect(html).toContain('src="assets/three-kit.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    // 8-bit targets only: half-float renders blank on this PC, and real glass ("transmission")
    // needs it
    expect(html).not.toMatch(/HalfFloatType|\bFloatType|transmission/);
    expect(html.match(/UnsignedByteType/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // the renderer is built once, so the live preview never piles up WebGL contexts
    expect(html.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(html).toContain("var TITLE_SAFE = 560");
    // a long title wraps onto two lines before shrinking; the artist stays smaller than it
    expect(html).toContain("var TITLE_LINES = 2");
    expect(html).toContain("var ARTIST_RATIO = 0.6");
  });
});
