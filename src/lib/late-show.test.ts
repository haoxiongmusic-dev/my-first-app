// Late Show (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.3).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "late-show");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Late Show template", () => {
  it("validates as a template with the spec's settings (a tagline instead of the artist)", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Late Show");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      tagline: "SYNTHWAVE FOREVER",
      font: "Orbitron",
      cover: "",
      mainColor: "#ff2fd0",
      accentColor: "#2fe8ff",
      intensity: 1,
      crtEffect: 70,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "8",
      bandCount: 100,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "tagline")).toMatchObject({
      type: "string",
      maxLength: 40,
    });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    expect(t.variables.find((v) => v.id === "crtEffect")).toMatchObject({
      type: "number",
      min: 0,
      max: 100,
      unit: "%",
    });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "tagline", "font"]],
      ["Images", ["cover"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "crtEffect"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "crtEffect",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "tagline", "cover"]);
  });

  it("uses the usual font list plus Orbitron, and the usual beat range and boost options", async () => {
    const t = await loadTemplate(dir);
    const halo = await loadTemplate(haloDir);
    const option = (tpl: Template, id: string) =>
      (tpl.variables.find((v) => v.id === id) as { options?: { value: string }[] }).options;
    expect(option(t, "font")).toEqual([
      { value: "Orbitron", label: "Orbitron" },
      ...option(halo, "font")!,
    ]);
    for (const id of ["beatRange", "spectrumBoost"]) {
      expect(option(t, id), id).toEqual(option(halo, id));
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
      ["Original", { mainColor: "#ff2fd0", accentColor: "#2fe8ff" }, "presets/original.jpg"],
      ["Green", { mainColor: "#3dff6a", accentColor: "#c8ff3d" }, "presets/green.jpg"],
      ["Sunset", { mainColor: "#ff8a2f", accentColor: "#ff2f6a" }, "presets/sunset.jpg"],
      ["Ice", { mainColor: "#9ad8ff", accentColor: "#ffffff" }, "presets/ice.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("ships Orbitron with its licence", async () => {
    for (const file of ["orbitron-400.woff2", "orbitron-700.woff2", "OFL-orbitron.txt"]) {
      await expect(readFile(path.join(dir, "assets", "fonts", file))).resolves.toBeTruthy();
    }
  });

  it("follows the template, voxel and three.js rules", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/show-motion.js"');
    expect(html).toContain('src="assets/tv-voxels.js"');
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
    // the TV: voxel parts drawn as instanced cubes, seen nearly head-on with a slow drift
    expect(html).toContain("TV.buildTV()");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("M.cameraDrift(");
    // the scene on the screen: grid, horizon spectrum, sun, glitching cover, flicker and dips
    expect(html).toContain("M.loudTable(");
    expect(html).toContain("M.gridTravel(");
    expect(html).toContain("M.horizonValues(V, ");
    expect(html).toContain("M.horizonHeights(");
    expect(html).toContain("M.sunGaps(");
    expect(html).toContain("M.sceneLevels(");
    expect(html).toContain("M.strongBeats(audio, t)");
    expect(html).toContain("M.glitch(");
    expect(html).toContain("M.flicker(");
    expect(html).toContain("M.screenDip(");
    expect(html).toContain("M.rollLine(");
    expect(html).toContain("V.beatEnvelope(audio, t, ");
    // the CRT look scales with its setting
    expect(html).toContain('setting("crtEffect")');
    // the cover: set at startup, redrawn when it arrives, a failed picture just left out
    expect(html).toContain('coverImg.addEventListener("load"');
    expect(html).toContain('coverImg.addEventListener("error"');
    // long titles wrap and shrink to fit the screen
    expect(html).toContain("M.fitTitle(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
