// World Orbit (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.7).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "world-orbit");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("World Orbit template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("World Orbit");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      cover: "",
      mainColor: "#ffcc66",
      accentColor: "#2a6cff",
      intensity: 1,
      orbitSeconds: 12,
      scaleOnBeat: true,
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
    expect(t.variables.find((v) => v.id === "orbitSeconds")).toMatchObject({
      type: "number",
      min: 6,
      max: 30,
      default: 12,
    });
    expect(t.variables.find((v) => v.id === "scaleOnBeat")).toMatchObject({ type: "boolean" });
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
      ["Effects", ["intensity", "orbitSeconds", "scaleOnBeat"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "orbitSeconds",
      "scaleOnBeat",
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
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", { mainColor: "#ffcc66", accentColor: "#2a6cff" }, "presets/original.jpg"],
      ["Silver", { mainColor: "#e8eef8", accentColor: "#3a4a6a" }, "presets/silver.jpg"],
      ["Mars", { mainColor: "#ffd2a0", accentColor: "#c0502a" }, "presets/mars.jpg"],
      ["Emerald", { mainColor: "#c8ffd8", accentColor: "#14806a" }, "presets/emerald.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template rules: seeded, no timers, 8-bit targets, safe cover, drawn planet", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/orbit-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    expect(html).toContain("V.createTarget(");
    expect(html).toContain("V.trackGl(");
    expect(html).toContain("data-song-length");
    // the planet is drawn in code (a ray–sphere shader), never a picture of Earth
    expect(html).not.toMatch(/\.(jpg|jpeg|png|webp)["']/i);
    expect(html).toContain("PLANET_FS");
    // the planet pulses on the beat envelope; the rays read the spectrum round the ring
    expect(html).toContain("V.beatEnvelope(audio, t, M.PULSE_RELEASE)");
    expect(html).toContain("V.ringValues(");
    // the orbit, the light leak and the drift all run on the song time
    expect(html).toContain("M.placeLetters(layout, songTime, ORBIT)");
    expect(html).toContain("M.lightLeak(songTime, V.mulberry32)");
    expect(html).toContain("M.drift(songTime)");
    // the cover: set at startup, drawn again when it loads, left out when it fails
    expect(html).toContain('coverImg.addEventListener("load"');
    expect(html).toContain('coverImg.addEventListener("error"');
    // thin rays stay visible in the small live preview
    expect(html).toContain("function thin(width)");
    // the letters come from an atlas drawn once the fonts have loaded (the bold weight too)
    expect(html).toContain("fontEpoch");
    expect(html).toContain("w800");
    // long artist names shrink and are scaled down past the smallest size
    expect(html).toContain("var TEXT_SAFE = ");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
