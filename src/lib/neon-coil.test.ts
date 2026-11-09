// Neon Coil (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.6).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "neon-coil");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Neon Coil template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Neon Coil");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Outfit",
      cover: "",
      mainColor: "#3d8bff",
      accentColor: "#ff4fd8",
      intensity: 1,
      scaleOnBeat: true,
      showTimer: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
      bandCount: 75,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    expect(t.variables.find((v) => v.id === "scaleOnBeat")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "showTimer")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["cover"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "scaleOnBeat", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "scaleOnBeat",
      "showTimer",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "cover"]);
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

  it("declares the cover exactly as Nova Streak does", async () => {
    const t = await loadTemplate(dir);
    const nova = await loadTemplate(novaDir);
    expect(t.variables.find((v) => v.id === "cover")).toEqual(
      nova.variables.find((v) => v.id === "cover"),
    );
    expect(t.variables.find((v) => v.id === "cover")).toMatchObject({
      type: "image",
      label: "Cover art",
      default: "",
      fit: "square",
    });
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#3d8bff", accentColor: "#ff4fd8" }, "presets/original.jpg"],
      ["Matrix", { mainColor: "#2aff6a", accentColor: "#c8ff2a" }, "presets/matrix.jpg"],
      ["Sunset", { mainColor: "#ff7a2a", accentColor: "#ffd12a" }, "presets/sunset.jpg"],
      ["Ice", { mainColor: "#9ae8ff", accentColor: "#ffffff" }, "presets/ice.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, safe cover, titles fit", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/coil-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    expect(html).toContain("V.trackGl(");
    expect(html).toContain("data-song-length");
    // the coil pumps on the beat envelope (release 0.3 s); the blobs read the smoothed
    // spectrum at 12 points along the line, bass at the left
    expect(html).toContain("V.beatEnvelope(audio, t, M.PUMP_RELEASE)");
    expect(html).toContain("V.smoothSpectrum(");
    expect(html).toContain("V.mirrorBars(");
    // glitch streaks are seeded by the song time
    expect(html).toContain("M.glitchStreaks(songTime, V.mulberry32)");
    // the timer shows the song's own time, also in a section
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    // the cover: set at startup, drawn again when it loads, left out when it fails
    expect(html).toContain('coverImg.addEventListener("load"');
    expect(html).toContain('coverImg.addEventListener("error"');
    // thin lines stay visible in the small live preview
    expect(html).toContain("function thin(width)");
    // long names wrap onto two lines, shrink, and are scaled down past the smallest size
    expect(html).toContain("var TEXT_SAFE = ");
    expect(html).toContain("var TEXT_LINES = 2");
    expect(html).toContain('"scale(" + (TEXT_SAFE / ');
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
