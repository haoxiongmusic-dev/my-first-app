// Night Flight (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.4).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "night-flight");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");
const novaDir = path.join(process.cwd(), "templates", "nova-streak");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Night Flight template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Night Flight");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Outfit",
      cover: "",
      mainColor: "#8ad8ff",
      accentColor: "#ffffff",
      intensity: 1,
      shakeOnBeat: true,
      showCockpit: true,
      showTimer: true,
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
    for (const id of ["shakeOnBeat", "showCockpit", "showTimer"]) {
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
      ["Images", ["cover"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "shakeOnBeat", "showCockpit", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "showCockpit",
      "showTimer",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "cover"]);
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
      ["Original", { mainColor: "#8ad8ff", accentColor: "#ffffff" }, "presets/original.jpg"],
      ["Purple", { mainColor: "#c08aff", accentColor: "#ffd8ff" }, "presets/purple.jpg"],
      ["Orange", { mainColor: "#ffb070", accentColor: "#fff0d8" }, "presets/orange.jpg"],
      [
        "Clear",
        { mainColor: "#8ad8ff", accentColor: "#ffffff", showCockpit: false },
        "presets/clear.jpg",
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
    expect(html).toContain('src="assets/flight-motion.js"');
    expect(html).toContain('src="assets/cockpit-voxels.js"');
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
    // the cockpit: voxel parts drawn as instanced cubes, needles turned per frame
    expect(html).toContain("CP.buildCockpit()");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("M.needleAngle(");
    expect(html).toContain("M.meterLit(");
    expect(html).toContain('setting("showCockpit")');
    // the flight: clouds from the loudness so far (a section carries what came before)
    expect(html).toContain("M.loudTable(");
    expect(html).toContain("M.loudSeconds(");
    expect(html).toContain("loudBefore");
    expect(html).toContain("M.cloudTravel(");
    expect(html).toContain("M.bankAngle(");
    expect(html).toContain("M.shakeOffset(");
    expect(html).toContain('setting("shakeOnBeat")');
    expect(html).toContain("M.skyLevels(");
    // the HUD: ring kit ticks, pulse and the inner ring's turn
    expect(html).toContain("V.ringAngles(");
    expect(html).toContain("V.ringValues(");
    expect(html).toContain("M.tickLengths(");
    expect(html).toContain("M.ringPulse(");
    expect(html).toContain("M.innerTurn(");
    expect(html).toContain("V.beatEnvelope(audio, t, ");
    // the timer shows the whole song's time
    expect(html).toContain("V.songClock(audio, t)");
    expect(html).toContain('setting("showTimer")');
    // the cover: set at startup, redrawn when it arrives, a failed picture just left out
    expect(html).toContain('coverImg.addEventListener("load"');
    expect(html).toContain('coverImg.addEventListener("error"');
    // long titles wrap and shrink to fit
    expect(html).toContain("M.fitTitle(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
