// Red Letter (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.3).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "red-letter");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Red Letter template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Red Letter");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Oswald",
      mainColor: "#e8e8e8",
      accentColor: "#ff2a2a",
      intensity: 1,
      glitchOnBeat: true,
      grain: 50,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "8",
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
    expect(t.variables.find((v) => v.id === "glitchOnBeat")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "grain")).toMatchObject({
      type: "number",
      min: 0,
      max: 100,
      unit: "%",
    });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "glitchOnBeat", "grain"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "grain",
      "glitchOnBeat",
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
      ["Original", { mainColor: "#e8e8e8", accentColor: "#ff2a2a" }, "presets/original.jpg"],
      ["Cyan", { mainColor: "#e8e8e8", accentColor: "#2ad9ff" }, "presets/cyan.jpg"],
      ["Toxic", { mainColor: "#e8e8e8", accentColor: "#9dff2a" }, "presets/toxic.jpg"],
      ["Amber", { mainColor: "#f0e6d0", accentColor: "#ffa31a" }, "presets/amber.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, text fits the frame", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/letter-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    // the film is WebGL (8-bit targets, freed on rebuild); the text is a 2D canvas
    expect(html).toContain('getContext("webgl"');
    expect(html).toContain('getContext("2d"');
    expect(html).toContain("V.trackGl(");
    // the red letter, glitch and scope line come from the motion module and the line kit
    expect(html).toContain("M.redSlot(");
    expect(html).toContain("M.glitchOffsets(");
    expect(html).toContain("V.scopeLine(");
    expect(html).toContain("V.beatEnvelope(");
    expect(html).toContain("V.mulberry32");
    // grain changes at most 6 times a second and stays subtle
    expect(html).toContain("M.wearEpoch(");
    expect(html).toContain("M.grainAmount(");
    // song-length elements get their duration from the job builder
    expect(html).toContain("data-song-length");
    // long titles wrap onto two lines or shrink, never wider than the safe width
    expect(html).toContain("M.placeTitle(");
    expect(html).toContain("M.artistSize(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
