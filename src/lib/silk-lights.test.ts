// Silk Lights (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.2).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "silk-lights");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Silk Lights template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Silk Lights");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Poppins",
      cover: "",
      tag1: "HIP HOP",
      tag2: "NEW MUSIC",
      tag3: "ELECTRONIC",
      tag4: "",
      tag5: "",
      mainColor: "#ff2fb4",
      accentColor: "#2fd9ff",
      intensity: 1,
      showTimer: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
      bandCount: 65,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    for (const id of ["tag1", "tag2", "tag3", "tag4", "tag5"]) {
      expect(
        t.variables.find((v) => v.id === id),
        id,
      ).toMatchObject({ type: "string", maxLength: 20 });
    }
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    expect(t.variables.find((v) => v.id === "showTimer")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Tags", ["tag1", "tag2", "tag3", "tag4", "tag5"]],
      ["Images", ["cover"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "showTimer",
      "font",
    ]);
    expect(t.manifest.content).toEqual([
      "title",
      "artist",
      "cover",
      "tag1",
      "tag2",
      "tag3",
      "tag4",
      "tag5",
    ]);
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
      default: "",
      fit: "square",
    });
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#ff2fb4", accentColor: "#2fd9ff" }, "presets/original.jpg"],
      ["Sunset", { mainColor: "#ff7a2f", accentColor: "#ff2f6a" }, "presets/sunset.jpg"],
      ["Ocean", { mainColor: "#2f7aff", accentColor: "#2fffd0" }, "presets/ocean.jpg"],
      ["Mono", { mainColor: "#e8e8f0", accentColor: "#8a8aa0" }, "presets/mono.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 2D canvas, safe cover, text fits", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/silk-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    // drawn on a 2D canvas, no WebGL; the glow is drawn small and scaled up (cheap blur)
    expect(html).toContain('getContext("2d"');
    expect(html).not.toContain('getContext("webgl"');
    expect(html).toContain("var GLOW_RES = 0.25");
    // the glow brightens on the beat (release 0.3 s); its hot spots are seeded and time-only
    expect(html).toContain("V.beatEnvelope(audio, t, M.BEAT_RELEASE)");
    expect(html).toContain("M.glowSpots(");
    expect(html).toContain("V.mulberry32");
    expect(html).toContain("M.spotsAt(SPOTS, songTime");
    // the wave line: a smooth curve through the smoothed spectrum, bass at the left
    expect(html).toContain("V.smoothSpectrum(");
    expect(html).toContain("V.mirrorBars(");
    expect(html).toContain("M.waveHeights(");
    // the timer shows the song's own time, also in a section
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    expect(html).toContain("data-song-length");
    // the cover: set at startup, drawn again when it loads, left out when it fails, with a
    // designed fallback when there is none
    expect(html).toContain('coverImg.addEventListener("load"');
    expect(html).toContain('coverImg.addEventListener("error"');
    expect(html).toContain("function drawCoverFallback(");
    // thin lines stay visible in the small live preview
    expect(html).toContain("function thin(width)");
    // long text shrinks, and past the smallest size is squeezed to fit; pills are laid out
    expect(html).toContain("function fitText(");
    expect(html).toContain("M.pillLayout(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
