// Hyper Tunnel (spec: docs/superpowers/specs/2026-11-10-m9-final-templates-design.md §5.7).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "hyper-tunnel");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Hyper Tunnel template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Hyper Tunnel");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Orbitron",
      logo: "",
      mainColor: "#2ad9ff",
      accentColor: "#ff2abf",
      intensity: 1,
      finish: "silver",
      showTimer: true,
      beatRange: "kick",
      spectrumLow: 30,
      spectrumHigh: 1000,
      spectrumBoost: "4",
      bandCount: 30,
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    const finish = t.variables.find((v) => v.id === "finish") as {
      type: string;
      options: { value: string }[];
    };
    expect(finish.type).toBe("enum");
    expect(finish.options.map((o) => o.value)).toEqual(["silver", "gold"]);
    expect(t.variables.find((v) => v.id === "showTimer")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "spectrumLow")).toMatchObject({ min: 30, max: 16000 });
    expect(t.variables.find((v) => v.id === "spectrumHigh")).toMatchObject({
      min: 30,
      max: 16000,
    });
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Images", ["logo"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "finish", "showTimer"]],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "finish",
      "showTimer",
      "font",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist", "logo"]);
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

  it("declares the logo as a square picture setting", async () => {
    const t = await loadTemplate(dir);
    expect(t.variables.find((v) => v.id === "logo")).toEqual({
      id: "logo",
      type: "image",
      label: "Logo",
      default: "",
      fit: "square",
    });
  });

  it("has the four presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      [
        "Electric",
        { mainColor: "#2ad9ff", accentColor: "#ff2abf", finish: "silver" },
        "presets/electric.jpg",
      ],
      [
        "Matrix",
        { mainColor: "#2aff6a", accentColor: "#c8ffd0", finish: "silver" },
        "presets/matrix.jpg",
      ],
      [
        "Original",
        { mainColor: "#ff2abf", accentColor: "#2ad9ff", finish: "silver" },
        "presets/original.jpg",
      ],
      [
        "Metal",
        { mainColor: "#ffb02a", accentColor: "#ffffff", finish: "gold" },
        "presets/metal.jpg",
      ],
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
    expect(html).toContain('src="assets/tunnel-motion.js"');
    expect(html).toContain('src="assets/robot-voxels.js"');
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
    // the robot: voxel parts as instanced cubes, the head nodding and turning, the arms swaying
    expect(html).toContain("ROBOT.buildRobot()");
    expect(html).toContain("new THREE.InstancedMesh(");
    expect(html).toContain("V.beatEnvelope(audio, t, M.NOD_RELEASE)");
    expect(html).toContain("M.headNod(");
    expect(html).toContain("M.headTurn(");
    expect(html).toContain("M.armSway(");
    expect(html).toContain("M.visorLevel(");
    expect(html).toContain('setting("finish")');
    // the tunnel: travelled from the loudness so far (a section matches the full render)
    expect(html).toContain("M.loudTable(");
    expect(html).toContain("M.loudSeconds(");
    expect(html).toContain("loudBefore");
    expect(html).toContain("M.tunnelTravel(");
    expect(html).toContain("M.tunnelFrames(");
    expect(html).toContain("M.frameLevels(");
    expect(html).toContain("M.edgeLevel(");
    expect(html).toContain("M.gapLayout(");
    expect(html).toContain("V.beatEnvelope(audio, t, M.EDGE_RELEASE)");
    // the flares on strong beats
    expect(html).toContain("M.hitEvents(");
    expect(html).toContain("M.flare(");
    // the HUD: meters, crawling ticks, the timer from the song clock
    expect(html).toContain("M.meterHeights(");
    expect(html).toContain("V.mirrorBars(");
    expect(html).toContain("M.hudCrawl(");
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    expect(html).toContain('setting("showTimer")');
    // the logo: set at startup, redrawn when it arrives, a failed picture just left out
    expect(html).toContain('logoImg.addEventListener("load"');
    expect(html).toContain('logoImg.addEventListener("error"');
    expect(html).toContain('setLogo(setting("logo"))');
    // long titles wrap and shrink to fit
    expect(html).toContain("M.fitTitle(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
