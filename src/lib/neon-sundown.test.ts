// Neon Sundown (spec: docs/superpowers/specs/2026-11-06-m6-neon-sundown-design.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "neon-sundown");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Neon Sundown template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      cover: "",
      skyColor: "#1a0533",
      sunTopColor: "#ffd23f",
      sunBottomColor: "#ff2e88",
      gridColor: "#00e5ff",
      intensity: 1,
      spectrumSide: "outside",
      gridSpeed: 100,
      vhsLook: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
      bandCount: 70,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "cover")).toMatchObject({
      type: "image",
      fit: "square",
      default: "",
      label: "Cover art",
    });
    expect(t.variables.find((v) => v.id === "spectrumSide")).toMatchObject({
      options: [
        { value: "outside", label: "Outside" },
        { value: "inside", label: "Inside" },
        { value: "both", label: "Both" },
      ],
    });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["cover"]],
      ["Colors", ["skyColor", "sunTopColor", "sunBottomColor", "gridColor"]],
      ["Effects", ["intensity", "spectrumSide", "gridSpeed", "vhsLook"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "skyColor",
      "sunTopColor",
      "sunBottomColor",
      "gridColor",
      "intensity",
      "spectrumSide",
      "vhsLook",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "cover"]);
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    const colors = (sky: string, top: string, bottom: string, grid: string) => ({
      skyColor: sky,
      sunTopColor: top,
      sunBottomColor: bottom,
      gridColor: grid,
    });
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", colors("#1a0533", "#ffd23f", "#ff2e88", "#00e5ff"), "presets/original.jpg"],
      ["Flamingo", colors("#2a0638", "#ffb3e6", "#ff3fa4", "#ff7ad9"), "presets/flamingo.jpg"],
      ["Red Desert", colors("#2b0a0a", "#ffcf5a", "#ff3b1f", "#ff6a3d"), "presets/red-desert.jpg"],
      ["Midnight", colors("#02040f", "#9fd8ff", "#3f5bff", "#5ef0ff"), "presets/midnight.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, safe cover loading", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/sundown-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    expect(html).toContain("var TITLE_SAFE = 1536");
    expect(html).toContain('coverImg.addEventListener("error"');
    // grid lines: widths and soft edges follow the preview size; columns are measured across
    // the line (they lean toward the horizon), so outer columns don't break into dots
    expect(html).toContain("M.gridLineParams(PREVIEW_SCALE)");
    expect(html).toContain("uniform float soft, crowdLo, crowdHi;");
    expect(html).toContain("dy / length(vec2(px.x - 960.0, dy))");
  });
});
