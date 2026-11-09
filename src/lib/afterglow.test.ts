// Afterglow (spec: docs/superpowers/specs/2026-11-10-m8-ten-templates-design.md §6.2).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplate, validateTemplate, type Template } from "@/lib/templates";

const dir = path.join(process.cwd(), "templates", "afterglow");
const haloDir = path.join(process.cwd(), "templates", "halo-rings");

function defaults(t: Template): Record<string, unknown> {
  return Object.fromEntries(t.variables.map((v) => [v.id, v.default]));
}

describe("Afterglow template", () => {
  it("validates as a template with the spec's settings", async () => {
    const t = await loadTemplate(dir);
    expect(validateTemplate(t)).toEqual([]);
    expect(t.manifest.name).toBe("Afterglow");
    expect(defaults(t)).toEqual({
      title: "SONG NAME",
      artist: "ARTIST NAME",
      font: "Montserrat",
      mainColor: "#ffffff",
      accentColor: "#ff3b4e",
      intensity: 1,
      layout: "classic",
      showTimer: true,
      backgroundDim: 35,
      showBackground: true,
      backgroundBlur: 0,
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
    const layout = t.variables.find((v) => v.id === "layout") as {
      type: string;
      options: { value: string }[];
    };
    expect(layout.type).toBe("enum");
    expect(layout.options.map((o) => o.value)).toEqual([
      "classic",
      "bigTitle",
      "bigTimer",
      "player",
    ]);
    for (const id of ["backgroundDim", "backgroundBlur"]) {
      expect(
        t.variables.find((v) => v.id === id),
        id,
      ).toMatchObject({
        type: "number",
        min: 0,
        max: 100,
        unit: "%",
      });
    }
    for (const id of ["showTimer", "showBackground"]) {
      expect(
        t.variables.find((v) => v.id === id),
        id,
      ).toMatchObject({ type: "boolean" });
    }
    expect(t.variables.find((v) => v.id === "bandCount")).toMatchObject({ min: 10, max: 100 });
    expect(t.manifest.groups.map((g) => [g.name, g.fields])).toEqual([
      ["Text", ["title", "artist", "font"]],
      ["Colors", ["mainColor", "accentColor"]],
      [
        "Effects",
        ["intensity", "layout", "showTimer", "backgroundDim", "showBackground", "backgroundBlur"],
      ],
      ["Audio", ["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost", "bandCount"]],
    ]);
    expect(t.manifest.basic).toEqual([
      "layout",
      "mainColor",
      "accentColor",
      "intensity",
      "backgroundDim",
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

  it("has the four layout presets from the spec, all white with the red accent", async () => {
    const t = await loadTemplate(dir);
    const look = (layout: string) => ({ layout, mainColor: "#ffffff", accentColor: "#ff3b4e" });
    expect(t.manifest.presets.map((p) => [p.name, p.values, p.thumbnail])).toEqual([
      ["Original", look("classic"), "presets/original.jpg"],
      ["Big Title", look("bigTitle"), "presets/big-title.jpg"],
      ["Big Timer", look("bigTimer"), "presets/big-timer.jpg"],
      ["Music Player", look("player"), "presets/music-player.jpg"],
    ]);
  });

  it("every preset has its thumbnail", async () => {
    const t = await loadTemplate(dir);
    for (const p of t.manifest.presets) {
      await expect(readFile(path.join(dir, p.thumbnail!)), p.name).resolves.toBeTruthy();
    }
  });

  it("ships only a tiny placeholder background, so no picture means the night city", async () => {
    const jpg = await readFile(path.join(dir, "assets", "background.jpg"));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8); // a JPEG
    expect(jpg.length).toBeLessThan(2000);
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('<img id="bgImage" src="assets/background.jpg"');
    expect(html).toContain("M.isPicture(");
  });

  it("follows the template rules: seeded, no timers, 2D canvas, the song clock, text fits", async () => {
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain('src="assets/afterglow-motion.js"');
    expect(html).toContain('src="assets/viz-toolkit.js"');
    expect(html).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval/);
    expect(html).not.toMatch(/HALF_FLOAT|OES_texture/);
    // drawn on a 2D canvas, no WebGL
    expect(html).toContain('getContext("2d"');
    expect(html).not.toContain('getContext("webgl"');
    // the bars and the clock come from the toolkit's line kit and song clock
    expect(html).toContain("V.mirrorBars(");
    expect(html).toContain("V.songClock(");
    expect(html).toContain("V.formatClock(");
    expect(html).toContain("V.mulberry32");
    // song-length elements get their duration from the job builder
    expect(html).toContain("data-song-length");
    // long text shrinks to fit its space, and past the smallest size is squeezed to fit
    expect(html).toContain("function fitText(");
    // the live preview's settings and resolution channels
    expect(html).toContain('registerRuntimeDataHandler("settings"');
    expect(html).toContain('registerRuntimeDataHandler("preview"');
  });
});
