// Moon Jelly (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.8).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "moon-jelly");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Moon Jelly template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Moon Jelly");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Outfit",
      mainColor: "#ff7ad8",
      accentColor: "#7ad8ff",
      intensity: 1,
      ripple: true,
      jellyCount: 9,
      water: "bright",
      showTimer: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "2",
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
    expect(t.variables.find((v) => v.id === "ripple")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "jellyCount")).toMatchObject({
      type: "number",
      min: 3,
      max: 14,
      step: 1,
    });
    const water = t.variables.find((v) => v.id === "water") as {
      type: string;
      options: { value: string }[];
    };
    expect(water.type).toBe("enum");
    expect(water.options.map((o) => o.value)).toEqual(["bright", "dark"]);
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
      ["Effects", ["intensity", "ripple", "jellyCount", "water", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "jellyCount",
      "ripple",
      "showTimer",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("uses the usual font list and the usual beat range and boost options", async () => {
    const t = await loadTemplate(dir);
    const halo = await loadTemplate(haloDir);
    const option = (tpl: Template, id: string) =>
      (tpl.variables.find((v) => v.id === id) as { options?: { value: string }[] }).options;
    for (const id of ["font", "beatRange", "spectrumBoost"]) {
      expect(option(t, id), id).toEqual(option(halo, id));
    }
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      [
        "Original",
        { mainColor: "#ff7ad8", accentColor: "#7ad8ff", water: "bright" },
        "presets/original.jpg",
      ],
      [
        "Glow",
        { mainColor: "#7affd8", accentColor: "#d8ff7a", water: "bright" },
        "presets/glow.jpg",
      ],
      [
        "Abyss",
        { mainColor: "#7a8aff", accentColor: "#ff7ad8", water: "dark" },
        "presets/abyss.jpg",
      ],
      [
        "Coral",
        { mainColor: "#ffb07a", accentColor: "#ff7a8a", water: "bright" },
        "presets/coral.jpg",
      ],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("follows the template, voxel and three.js rules", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/jelly-motion.js"');
    expect(html).toContain('src="assets/jelly-voxels.js"');
    expect(html).toContain('src="assets/three-kit.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    // 8-bit targets only: half-float renders blank on this PC; no physical glass
    expect(html).not.toMatch(/HalfFloatType|\bFloatType|transmission|HALF_FLOAT|OES_texture/);
    expect(html).not.toMatch(/new THREE\.WebGLRenderTarget\((?![^)]*UnsignedByteType)/);
    // colours exactly as picked: colour management and tone mapping off, linear output
    expect(html).toContain("THREE.ColorManagement.enabled = false");
    expect(html).toContain("THREE.NoToneMapping");
    expect(html).toContain("THREE.LinearSRGBColorSpace");
    // the renderer is built once, so the live preview never piles up WebGL contexts
    expect(html.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(html).toContain("data-song-length");
    // the jellyfish: voxel models drawn as instanced cubes (one mesh per part type), added on
    expect(html).toContain("JV.buildJelly(");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("THREE.AdditiveBlending");
    expect(html).toContain("M.jellyCount(");
    // each jellyfish's state from the song time and the beats alone
    expect(html).toContain("M.beatsAt(");
    expect(html).toContain("M.jellyAt(");
    expect(html).toContain("M.trail(");
    expect(html).toContain("M.chainPose(");
    // the glow from the loudness and each jellyfish's band
    expect(html).toContain("M.bandLevels(");
    expect(html).toContain("M.glowLevel(");
    // the water: the ripple on the beat, the light shafts' sway
    expect(html).toContain("V.beatEnvelope(audio, t, M.RIPPLE_RELEASE)");
    expect(html).toContain("M.wobblePx(");
    expect(html).toContain("M.shaftSway(");
    expect(html).toContain('setting("ripple")');
    expect(html).toContain('setting("water")');
    // the text: "artist · title" fitted, the timer from the song clock
    expect(html).toContain("M.titleLines(");
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    expect(html).toContain('setting("showTimer")');
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
