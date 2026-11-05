// Iron Wraith (spec: docs/superpowers/specs/2026-11-05-m6-iron-wraith-design.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "iron-wraith");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Iron Wraith template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.variables.map((v) => v.id)).toEqual([
      ...["title", "artist", "font"],
      ...["eyeColor", "lightColor", "waveColor"],
      ...["intensity", "jawStrength", "glow", "showTowers"],
      "beatRange",
      ...["waveALow", "waveAHigh", "waveABoost", "waveABands", "waveAThickness"],
      ...["waveBLow", "waveBHigh", "waveBBoost", "waveBBands", "waveBThickness"],
    ]);
    expect(defaults(t)).toMatchObject({
      font: "Orbitron",
      eyeColor: "#3fd0ff",
      lightColor: "#1f5fff",
      waveColor: "#5fb4ff",
      intensity: 1,
      jawStrength: 60,
      glow: 50,
      showTowers: true,
      waveALow: 30,
      waveAHigh: 2000,
      waveABoost: "2",
      waveABands: 10,
      waveAThickness: 7,
      waveBLow: 60,
      waveBHigh: 12000,
      waveBBoost: "1",
      waveBBands: 30,
      waveBThickness: 110,
    });
    expect(t.manifest.groups.map((g) => g.name)).toEqual([
      "Text",
      "Colors",
      "Effects",
      "Audio",
      "Waveform A",
      "Waveform B",
    ]);
    expect(t.manifest.basic).toEqual([
      "eyeColor",
      "intensity",
      "jawStrength",
      "glow",
      "font",
      "showTowers",
    ]);
    expect(t.manifest.content).toEqual(["title", "artist"]);
  });

  it("has the six presets from the spec, each with a thumbnail", async () => {
    const t = await loadTemplate(dir);
    const presets = t.manifest.presets;
    expect(presets.map((p) => p.name)).toEqual([
      "Original",
      "Original Speed",
      "Purple",
      "Green",
      "Blue Orange",
      "Red",
    ]);
    const values = (name: string) => presets.find((p) => p.name === name)?.values;
    expect(values("Original")).toEqual({
      eyeColor: "#3fd0ff",
      lightColor: "#1f5fff",
      waveColor: "#5fb4ff",
    });
    expect(values("Original Speed")).toEqual({
      eyeColor: "#3fd0ff",
      lightColor: "#1f5fff",
      waveColor: "#5fb4ff",
      intensity: 1.5,
      jawStrength: 85,
      glow: 70,
    });
    expect(values("Purple")).toEqual({
      eyeColor: "#d77bff",
      lightColor: "#7a2cff",
      waveColor: "#b56cff",
    });
    expect(values("Green")).toEqual({
      eyeColor: "#6bff9a",
      lightColor: "#11b84a",
      waveColor: "#4dff88",
    });
    expect(values("Blue Orange")).toEqual({
      eyeColor: "#ff9a2e",
      lightColor: "#1f5fff",
      waveColor: "#ff8a1e",
    });
    expect(values("Red")).toEqual({
      eyeColor: "#ff3b30",
      lightColor: "#c8102e",
      waveColor: "#ff5a4a",
    });
    for (const p of presets) {
      expect(p.thumbnail, p.name).toBeTruthy();
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("uses 8-bit render targets only", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).not.toMatch(/HalfFloatType|\bFloatType/);
    expect(html.match(/UnsignedByteType/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("ships its fonts with their licences", async () => {
    for (const file of [
      "orbitron-400.woff2",
      "orbitron-700.woff2",
      "audiowide-400.woff2",
      "OFL-orbitron.txt",
      "OFL-audiowide.txt",
    ]) {
      await expect(readFile(path.join(dir, "assets", "fonts", file))).resolves.toBeTruthy();
    }
  });
});
