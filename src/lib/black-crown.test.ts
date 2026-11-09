// Black Crown (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.9).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "black-crown");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Black Crown template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Black Crown");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      mainColor: "#ff8a1f",
      accentColor: "#8a1a0a",
      intensity: 1,
      spikeCount: 24,
      showTimer: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 150,
      spectrumBoost: "2",
      bandCount: 50,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    expect(t.variables.find((v) => v.id === "spikeCount")).toMatchObject({
      type: "number",
      min: 12,
      max: 40,
      step: 1,
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
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "spikeCount", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "spikeCount",
      "showTimer",
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
      ["Original", { mainColor: "#ff8a1f", accentColor: "#8a1a0a" }, "presets/original.jpg"],
      ["Toxic", { mainColor: "#9dff3a", accentColor: "#0a5a2a" }, "presets/toxic.jpg"],
      ["Cobalt", { mainColor: "#3ad1ff", accentColor: "#0a2a8a" }, "presets/cobalt.jpg"],
      ["Amethyst", { mainColor: "#d07aff", accentColor: "#3a0a6a" }, "presets/amethyst.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template and three.js rules", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/crown-motion.js"');
    expect(html).toContain('src="assets/three-kit.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    // 8-bit targets only: half-float renders blank on this PC; no physical glass
    expect(html).not.toMatch(/HalfFloatType|\bFloatType|transmission|HALF_FLOAT|OES_texture/);
    // the sky, the reflection, the composer and every bloom target
    expect(html.match(/UnsignedByteType/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // colours exactly as picked: colour management and tone mapping off, linear output
    expect(html).toContain("THREE.ColorManagement.enabled = false");
    expect(html).toContain("THREE.NoToneMapping");
    expect(html).toContain("THREE.LinearSRGBColorSpace");
    // the renderer is built once, so the live preview never piles up WebGL contexts
    expect(html.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(html).toContain("data-song-length");
    // the crown follows the released bass; spikes share one geometry, one draw call
    expect(html).toContain("M.crownLevel(audio, t");
    expect(html).toContain("M.spikesAt(");
    expect(html).toContain("THREE.InstancedBufferGeometry");
    // ripples from the beats plus the slow rings; the sky flares with the loudness
    expect(html).toMatch(/M\.ripples\(\s*audio\.recentHits\(t, M\.RIPPLE_HITS\)/);
    expect(html).toContain("M.calmRipples(");
    expect(html).toContain("M.skyFlare(");
    // the top spectrum and the timer show the song's own time, also in a section
    expect(html).toContain("V.mirrorBars(");
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
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
