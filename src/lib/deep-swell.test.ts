// Deep Swell (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.1).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "deep-swell");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Deep Swell template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Deep Swell");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      logo: "",
      mainColor: "#2a6dff",
      accentColor: "#9ad8ff",
      intensity: 1,
      waveHeight: 60,
      flowSpeed: 40,
      showBokeh: false,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 200,
      spectrumBoost: "1",
      bandCount: 100,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    for (const id of ["waveHeight", "flowSpeed"]) {
      expect(t.variables.find((v) => v.id === id)).toMatchObject({
        type: "number",
        min: 0,
        max: 100,
        unit: "%",
      });
    }
    expect(t.variables.find((v) => v.id === "showBokeh")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["logo"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "waveHeight", "flowSpeed", "showBokeh"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "waveHeight",
      "flowSpeed",
      "showBokeh",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "logo"]);
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

  it("declares the logo as a square picture setting", async () => {
    const t = await loadTemplate(dir);
    expect(t.variables.find((v) => v.id === "logo")).toEqual({
      id: "logo",
      type: "image",
      label: "Logo",
      default: "",
      fit: "square",
    });
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#2a6dff", accentColor: "#9ad8ff" }, "presets/original.jpg"],
      [
        "Bokeh",
        { mainColor: "#2a6dff", accentColor: "#9ad8ff", showBokeh: true },
        "presets/bokeh.jpg",
      ],
      ["Aurora", { mainColor: "#18d9a0", accentColor: "#c8ffe8" }, "presets/aurora.jpg"],
      ["Violet", { mainColor: "#7a3cff", accentColor: "#f0b8ff" }, "presets/violet.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, safe logo, title fits", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/swell-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    expect(html).toContain("V.trackGl(");
    expect(html).toContain("data-song-length");
    // the dot sea: one draw call of points, its waves built from the motion module's table
    expect(html).toContain("gl.drawArrays(gl.POINTS");
    expect(html).toContain("gl_PointSize");
    expect(html).toContain("M.WAVES");
    // the swell follows the low end, the roll the song time, the orbs and the logo likewise
    expect(html).toContain("M.lowLevel(");
    expect(html).toContain("M.swellHeight(");
    expect(html).toMatch(/M\.flowPhases\(\s*songTime/);
    expect(html).toMatch(/M\.orbs\(\s*songTime/);
    expect(html).toContain("V.beatEnvelope(audio, t, M.PULSE_RELEASE)");
    expect(html).toContain("M.logoScale(");
    // the logo: set at startup, drawn again when it loads, left out when it fails
    expect(html).toContain('logoImg.addEventListener("load"');
    expect(html).toContain('logoImg.addEventListener("error"');
    // thin lines stay visible in the small live preview
    expect(html).toContain("function thin(width)");
    // "ARTIST – TITLE" stays on one line: it shrinks, then is scaled down, never overflows
    expect(html).toContain("var TEXT_SAFE = ");
    expect(html).toContain('"scale(" + (TEXT_SAFE / ');
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
