// Nova Streak (spec: docs/superpowers/specs/2026-11-06-m6-nova-streak-design.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Nova Streak template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.variables.map((v) => v.id)).toEqual([
      ...["title", "artist", "font", "cover"],
      ...["mainColor", "accentColor"],
      ...["intensity", "borderGlow", "starDensity", "showBackground", "backgroundBlur"],
      ...["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"],
    ]);
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      cover: "",
      mainColor: "#ff2fb3",
      accentColor: "#8a3cff",
      intensity: 1,
      borderGlow: 70,
      starDensity: 100,
      showBackground: false,
      backgroundBlur: 60,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
      bandCount: 100,
    });
    expect(t.variables.find((v) => v.id === "cover")).toMatchObject({
      type: "image",
      fit: "square",
      default: "",
      label: "Cover art",
    });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["cover"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "borderGlow", "starDensity", "showBackground", "backgroundBlur"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "borderGlow",
      "font",
      "showBackground",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "cover"]);
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#ff2fb3", accentColor: "#8a3cff" }, "presets/original.jpg"],
      ["Red Orange", { mainColor: "#ff2a2a", accentColor: "#ff9a1f" }, "presets/red-orange.jpg"],
      ["Blue Green", { mainColor: "#2f7bff", accentColor: "#19e0c0" }, "presets/blue-green.jpg"],
      ["Purple Pink", { mainColor: "#9b4dff", accentColor: "#ff5fd2" }, "presets/purple-pink.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets only", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/streak-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|\bgl\.FLOAT\b[^,]*texImage2D|OES_texture/);
    expect(html).toContain("V.createTarget("); // the toolkit's targets are always 8-bit
  });
});
