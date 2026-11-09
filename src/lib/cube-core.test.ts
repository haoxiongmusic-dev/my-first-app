// Cube Core (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.10).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "cube-core");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Cube Core template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Cube Core");
    // no spectrum settings except the boost (for the power bar)
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Oswald",
      mainColor: "#9a4dff",
      accentColor: "#ff8a2a",
      intensity: 1,
      behaviour: "snap",
      showReadout: true,
      showTimer: true,
      beatRange: "kick",
      spectrumBoost: "2",
    });
    expect(t.variables.map((v) => v.id)).toEqual(Object.keys(defaults(t)));
    expect(t.variables.find((v) => v.id === "title")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "artist")).toMatchObject({ maxLength: 60 });
    expect(t.variables.find((v) => v.id === "intensity")).toMatchObject({
      min: 0.2,
      max: 2,
      step: 0.1,
    });
    const behaviour = t.variables.find((v) => v.id === "behaviour") as {
      type: string;
      options: { value: string }[];
    };
    expect(behaviour.type).toBe("enum");
    expect(behaviour.options.map((o) => o.value)).toEqual(["snap", "glide", "raver", "drift"]);
    expect(t.variables.find((v) => v.id === "showReadout")).toMatchObject({ type: "boolean" });
    expect(t.variables.find((v) => v.id === "showTimer")).toMatchObject({ type: "boolean" });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      ["Effects", ["intensity", "behaviour", "showReadout", "showTimer"]],
      ["Audio", ["beatRange", "spectrumBoost"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "accentColor",
      "intensity",
      "behaviour",
      "showReadout",
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

  it("has the four behaviour presets from the spec", async () => {
    const t = await loadTemplate(dir);
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      [
        "Original",
        { behaviour: "snap", mainColor: "#9a4dff", accentColor: "#ff8a2a" },
        "presets/original.jpg",
      ],
      [
        "Glide",
        { behaviour: "glide", mainColor: "#2ad9ff", accentColor: "#ff4fd8" },
        "presets/glide.jpg",
      ],
      [
        "Raver",
        { behaviour: "raver", mainColor: "#ff2a6a", accentColor: "#ffe62a" },
        "presets/raver.jpg",
      ],
      [
        "Drift",
        { behaviour: "drift", mainColor: "#7dffb0", accentColor: "#2a8aff" },
        "presets/drift.jpg",
      ],
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
    expect(html).toContain('src="assets/cube-motion.js"');
    expect(html).toContain('src="assets/three-kit.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    // 8-bit targets only: half-float renders blank on this PC; no physical glass
    expect(html).not.toMatch(/HalfFloatType|\bFloatType|transmission|HALF_FLOAT|OES_texture/);
    // the composer and every bloom target
    expect(html.match(/UnsignedByteType/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("rt.texture.type = THREE.UnsignedByteType");
    // colours exactly as picked: colour management and tone mapping off, linear output
    expect(html).toContain("THREE.ColorManagement.enabled = false");
    expect(html).toContain("THREE.NoToneMapping");
    expect(html).toContain("THREE.LinearSRGBColorSpace");
    // the renderer is built once, so the live preview never piles up WebGL contexts
    expect(html.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(html).toContain("data-song-length");
    // the cubes: beats by song frame, behaviours and edge brightness from the motion module
    expect(html).toContain("M.beatsAt(audio, t)");
    expect(html).toContain("M.cubesAt(");
    expect(html).toContain("M.edgeLevel(V.beatEnvelope(audio, t, M.EDGE_RELEASE))");
    expect(html).toContain("M.power(");
    expect(html).toContain("M.roomGlow(");
    // glowing edges: a thin core and a wide additive copy, mirrored under the floor
    expect(html).toContain("THREE.AdditiveBlending");
    expect(html).toContain("THREE.InstancedBufferGeometry");
    expect(html).toMatch(/reflection/i);
    // the readout's numbers come from the cubes and the audio
    expect(html).toContain("M.cubeAngles(");
    expect(html).toContain("M.formatAngle(");
    expect(html).toContain("M.formatPower(");
    expect(html).toContain("M.behaviourLabel(");
    // the timer shows the song's own time, also in a section
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    // thin lines stay visible in the small live preview
    expect(html).toContain("function thin(width)");
    // long names wrap, shrink, and are scaled down past the smallest size
    expect(html).toContain("var TITLE_SAFE = ");
    expect(html).toContain("var TITLE_LINES = 3");
    expect(html).toContain('"scale(" + k.toFixed(4)');
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
