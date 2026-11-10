// Static Tower (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.6).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "static-tower");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Static Tower template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Static Tower");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Oswald",
      picture: "",
      mainColor: "#2affd8",
      accentColor: "#ffffff",
      intensity: 1,
      react: "centre",
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
    const react = t.variables.find((v) => v.id === "react") as {
      type: string;
      options: { value: string }[];
    };
    expect(react.type).toBe("enum");
    expect(react.options.map((o) => o.value)).toEqual(["centre", "all"]);
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["picture"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "react"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual(["mainColor", "accentColor", "intensity", "react", "font"]);
    expect(t.manifest.content).toEqual(["title", "artist", "picture"]);
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

  it("declares the picture as an image setting, like Nova Streak's cover", async () => {
    const t = await loadTemplate(dir);
    const nova = await loadTemplate(novaDir);
    const cover = nova.variables.find((v) => v.id === "cover");
    expect(t.variables.find((v) => v.id === "picture")).toEqual({
      ...cover,
      id: "picture",
      label: "Picture",
    });
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      [
        "Original",
        { mainColor: "#2affd8", accentColor: "#ffffff", react: "centre" },
        "presets/original.jpg",
      ],
      [
        "Broadcast",
        { mainColor: "#ff3a3a", accentColor: "#ffd0d0", react: "all" },
        "presets/broadcast.jpg",
      ],
      [
        "Amber",
        { mainColor: "#ffb02a", accentColor: "#fff0c0", react: "centre" },
        "presets/amber.jpg",
      ],
      [
        "Ghost",
        { mainColor: "#b0c0ff", accentColor: "#ffffff", react: "all" },
        "presets/ghost.jpg",
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
    expect(html).toContain('src="assets/tower-motion.js"');
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
    // the stack: the TVs' voxels drawn as instanced cubes, one screen quad per set
    expect(html).toContain("TV.buildTower()");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("M.screenLooks(");
    expect(html).toContain("M.screenLevels(");
    expect(html).toContain('setting("react")');
    expect(html).toContain("M.screenStatic(");
    // the storm: drifting clouds, lightning from the clouds onto the top TV, the flash
    expect(html).toContain("M.cloudDrift(");
    expect(html).toContain("M.hitEvents(");
    expect(html).toContain("M.strike(");
    expect(html).toContain("V.lightningPath(");
    expect(html).toContain("V.lightningBranches(");
    expect(html).toContain("M.flash(");
    expect(html).toContain("M.skyLight(");
    expect(html).toContain("M.loudLevel(");
    expect(html).toContain("M.towerSway(");
    // the horizon hairlines and the ground line: mirrored bars, bass in the middle
    expect(html).toContain("V.mirrorBars(");
    expect(html).toContain("M.specHeights(");
    expect(html).toContain("V.beatEnvelope(audio, t, ");
    // the picture: set at startup, redrawn when it arrives, a failed picture just left out
    expect(html).toContain('pictureImg.addEventListener("load"');
    expect(html).toContain('pictureImg.addEventListener("error"');
    expect(html).toContain('setPicture(setting("picture"))');
    // long titles wrap and shrink to fit
    expect(html).toContain("M.fitTitle(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
