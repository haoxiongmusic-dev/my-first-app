// Live Wire (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.5).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "live-wire");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Live Wire template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Live Wire");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Oswald",
      mainColor: "#2a8aff",
      accentColor: "#9ad8ff",
      intensity: 1,
      shakeOnBeat: true,
      showDebris: true,
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
    for (const id of ["shakeOnBeat", "showDebris"]) {
      expect(
        t.variables.find((v) => v.id === id),
        id,
      ).toMatchObject({ type: "boolean" });
    }
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "shakeOnBeat", "showDebris"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "shakeOnBeat",
      "showDebris",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("uses the usual font, beat range and boost options", async () => {
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
      ["Original", { mainColor: "#2a8aff", accentColor: "#9ad8ff" }, "presets/original.jpg"],
      ["Inferno", { mainColor: "#ff5a1a", accentColor: "#ffd08a" }, "presets/inferno.jpg"],
      ["Toxic", { mainColor: "#5aff2a", accentColor: "#e0ffb0" }, "presets/toxic.jpg"],
      ["Violet", { mainColor: "#9a2aff", accentColor: "#f0b0ff" }, "presets/violet.jpg"],
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
    expect(html).toContain('src="assets/wire-motion.js"');
    expect(html).toContain('src="assets/speaker-voxels.js"');
    expect(html).toContain('src="assets/three-kit.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    // 8-bit targets only: half-float renders blank on this PC; no physical glass
    expect(html).not.toMatch(/HalfFloatType|\bFloatType|transmission|HALF_FLOAT|OES_texture/);
    expect(html).toMatch(/new THREE\.WebGLRenderTarget\([^)]*type: THREE\.UnsignedByteType/);
    // colours exactly as picked: colour management and tone mapping off, linear output
    expect(html).toContain("THREE.ColorManagement.enabled = false");
    expect(html).toContain("THREE.NoToneMapping");
    expect(html).toContain("THREE.LinearSRGBColorSpace");
    // the renderer is built once, so the live preview never piles up WebGL contexts
    expect(html.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(html).toContain("data-song-length");
    // the speaker: voxel parts drawn as instanced cubes, the cone pumping with the bass
    expect(html).toContain("SP.buildSpeaker()");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("M.coneScale(");
    expect(html).toContain("M.bassLevel(");
    expect(html).toContain("V.beatEnvelope(audio, t, ");
    // the arcs: lightning along the cables and round the rim, re-seeded 12 times a second
    expect(html).toContain("M.tickOf(");
    expect(html).toContain("M.cablePath(");
    expect(html).toContain("M.cableArcs(");
    expect(html).toContain("M.ringArcs(");
    expect(html).toContain("M.boltAlong(");
    expect(html).toContain("V.lightningPath");
    // the spectrum: sparks round the rim from the ring kit
    expect(html).toContain("V.ringAngles(");
    expect(html).toContain("V.ringValues(");
    expect(html).toContain("M.sparkLengths(");
    // strong hits: the strike, the debris, the shake
    expect(html).toContain("M.hitEvents(");
    expect(html).toContain("M.hitArc(");
    expect(html).toContain("M.debris(");
    expect(html).toContain("M.shakeOffset(");
    expect(html).toContain('setting("shakeOnBeat")');
    expect(html).toContain('setting("showDebris")');
    // long titles wrap and shrink to fit
    expect(html).toContain("M.fitTitle(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
