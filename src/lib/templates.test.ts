import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  listTemplates,
  loadTemplate,
  parseVariables,
  resolveValues,
  TemplateError,
  validateTemplate,
  validateValue,
  type Template,
  type TemplateManifest,
  type TemplateVariable,
} from "@/lib/templates";

function htmlWith(vars: unknown[]): string {
  const json = JSON.stringify(vars).replace(/'/g, "&#39;");
  return `<!doctype html>\n<html lang="en" data-composition-variables='${json}'>\n<body></body></html>`;
}

const ALL_TYPES: TemplateVariable[] = [
  { id: "title", type: "string", label: "Title", default: "SUNLIGHT", maxLength: 60 },
  { id: "intensity", type: "number", label: "Intensity", default: 1, min: 0.2, max: 2, step: 0.1 },
  { id: "mainColor", type: "color", label: "Main color", default: "#ff6a12" },
  { id: "letterbox", type: "boolean", label: "Letterbox", default: true },
  {
    id: "boost",
    type: "enum",
    label: "Boost",
    default: "1",
    options: [
      { value: "1", label: "1×" },
      { value: "2", label: "2×" },
    ],
  },
];

function template(
  variables: TemplateVariable[],
  manifest: Partial<TemplateManifest> = {},
): Template {
  return {
    id: "demo",
    dir: "/templates/demo",
    variables,
    manifest: {
      name: "Demo",
      description: "A demo.",
      groups: [{ name: "All", fields: variables.map((v) => v.id) }],
      basic: [],
      content: [],
      presets: [],
      ...manifest,
    },
  };
}

const REQUIRED: TemplateVariable[] = [
  { id: "title", type: "string", label: "Title", default: "A" },
  { id: "artist", type: "string", label: "Artist", default: "B" },
  { id: "intensity", type: "number", label: "Intensity", default: 1, min: 0.2, max: 2 },
  { id: "mainColor", type: "color", label: "Main color", default: "#ff6a12" },
];

describe("parseVariables", () => {
  it("reads every type", () => {
    expect(parseVariables(htmlWith(ALL_TYPES))).toEqual(ALL_TYPES);
  });

  it("decodes entities", () => {
    const html = htmlWith([{ id: "a", type: "string", label: "It's", default: "x" }]);
    expect(html).toContain("It&#39;s");
    expect(parseVariables(html)[0].label).toBe("It's");
  });

  it("rejects bad declarations", () => {
    const missingDefault = htmlWith([{ id: "noDefault", type: "string", label: "x" }]);
    const unknownType = htmlWith([{ id: "oddType", type: "image", label: "x", default: "" }]);
    const enumNoOptions = htmlWith([{ id: "badEnum", type: "enum", label: "x", default: "a" }]);
    expect(() => parseVariables(missingDefault)).toThrow(TemplateError);
    expect(() => parseVariables(missingDefault)).toThrow(/noDefault/);
    expect(() => parseVariables(unknownType)).toThrow(/oddType/);
    expect(() => parseVariables(enumNoOptions)).toThrow(/badEnum/);
    expect(() => parseVariables("<html><body></body></html>")).toThrow(TemplateError);
  });
});

describe("validateValue", () => {
  const [title, intensity, color, letterbox, boost] = ALL_TYPES;

  it("checks each type", () => {
    expect(validateValue(color, "#12345g")).not.toBeNull();
    expect(validateValue(color, "#abc")).toBeNull();
    expect(validateValue(intensity, 250)).not.toBeNull();
    expect(validateValue(intensity, 1.5)).toBeNull();
    expect(validateValue(boost, "9")).not.toBeNull();
    expect(validateValue(boost, "2")).toBeNull();
    expect(validateValue(letterbox, "yes")).not.toBeNull();
    expect(validateValue(letterbox, false)).toBeNull();
    expect(validateValue(title, "x".repeat(61))).not.toBeNull();
  });
});

describe("validateTemplate", () => {
  it("requires every variable in exactly one group", () => {
    const t = template(REQUIRED, {
      groups: [
        { name: "Text", fields: ["title", "artist"] },
        { name: "More", fields: ["title", "intensity"] },
      ],
    });
    const problems = validateTemplate(t);
    expect(problems.some((p) => p.includes("mainColor"))).toBe(true);
    expect(problems.some((p) => p.includes("title"))).toBe(true);
    expect(problems).toHaveLength(2);
  });

  it("checks basic, content and presets", () => {
    const t = template(REQUIRED, {
      basic: ["nope"],
      presets: [{ name: "Hot", values: { intensity: 9 } }],
    });
    const problems = validateTemplate(t);
    expect(problems.some((p) => p.includes("nope"))).toBe(true);
    expect(problems.some((p) => p.includes("Hot") && p.includes("intensity"))).toBe(true);
  });

  it("requires title, artist and intensity", () => {
    const problems = validateTemplate(template([REQUIRED[3]]));
    for (const id of ["title", "artist", "intensity"]) {
      expect(problems.some((p) => p.includes(id))).toBe(true);
    }
  });

  it("accepts a valid template", () => {
    expect(validateTemplate(template(REQUIRED))).toEqual([]);
  });
});

describe("resolveValues", () => {
  const t = template(REQUIRED, { presets: [{ name: "Ice", values: { mainColor: "#12b8ff" } }] });

  it("applies preset then overrides", () => {
    const values = resolveValues(t, { preset: "Ice", overrides: { intensity: "1.5" } });
    expect(values).toEqual({ title: "A", artist: "B", intensity: 1.5, mainColor: "#12b8ff" });
    expect(() => resolveValues(t, { overrides: { nope: "1" } })).toThrow(/Unknown setting "nope"/);
    expect(() => resolveValues(t, { preset: "Nope" })).toThrow(/Unknown preset.*Ice/);
    expect(() => resolveValues(t, { overrides: { intensity: "lots" } })).toThrow(/intensity/);
  });
});

describe("listTemplates", () => {
  it("skips shared and folders without template.json", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "templates-"));
    const manifest: TemplateManifest = {
      name: "Alpha",
      description: "First.",
      groups: [{ name: "All", fields: REQUIRED.map((v) => v.id) }],
      basic: [],
      content: [],
      presets: [],
    };
    for (const id of ["alpha", "shared", "notes"]) await mkdir(path.join(root, id));
    await writeFile(path.join(root, "alpha", "index.html"), htmlWith(REQUIRED));
    await writeFile(path.join(root, "alpha", "template.json"), JSON.stringify(manifest));
    await writeFile(path.join(root, "shared", "template.json"), "{}");
    const list = await listTemplates(root);
    expect(list.map((t) => t.id)).toEqual(["alpha"]);
    expect(list[0].manifest.name).toBe("Alpha");
    expect(list[0].variables).toEqual(REQUIRED);
  });
});

describe("the real templates folder", () => {
  const root = path.join(process.cwd(), "templates");

  it("every template in templates/ is valid", async () => {
    const list = await listTemplates(root);
    expect(list.length).toBeGreaterThan(0);
    for (const t of list)
      expect({ id: t.id, problems: validateTemplate(t) }).toEqual({ id: t.id, problems: [] });
  });

  it("Particle Horizon's beatRange options match the toolkit", async () => {
    const { createRequire } = await import("node:module");
    const toolkit = createRequire(import.meta.url)("../../templates/shared/viz-toolkit.js") as {
      BEAT_RANGES: { value: string; label: string }[];
    };
    const t = (await listTemplates(root)).find((x) => x.id === "particle-horizon");
    const beatRange = t?.variables.find((v) => v.id === "beatRange");
    expect(beatRange?.type).toBe("enum");
    if (beatRange?.type !== "enum") return;
    expect(beatRange.options).toEqual(
      toolkit.BEAT_RANGES.map(({ value, label }) => ({ value, label })),
    );
    expect(beatRange.default).toBe("kick");
  });
});

describe("Particle Horizon settings", () => {
  it("declares every §4.1 setting, in group order", async () => {
    const t = await loadTemplate(path.join(process.cwd(), "templates", "particle-horizon"));
    const ids = [
      ...["title", "artist", "font"],
      ...["mainColor", "highlightColor", "tint"],
      ...["intensity", "letterbox", "showBackground", "backgroundBlur"],
      ...["densityX", "densityY", "waveScale", "waveHeight", "flowSpeed", "waveSpeed"],
      ...["beatRange", "spectrumLow", "spectrumHigh", "spectrumBoost"],
    ];
    expect(t.variables.map((v) => v.id)).toEqual(ids);
    expect(t.manifest.groups.map((g) => g.name)).toEqual([
      "Text",
      "Colors",
      "Effects",
      "Wave",
      "Audio",
    ]);
    expect(t.manifest.groups.flatMap((g) => g.fields)).toEqual(ids);
    expect(t.manifest.basic).toEqual([
      "mainColor",
      "intensity",
      "font",
      "showBackground",
      "backgroundBlur",
      "densityY",
      "densityX",
    ]);
  });
});

describe("Particle Horizon presets", () => {
  it("has the six presets with thumbnails on disk", async () => {
    const dir = path.join(process.cwd(), "templates", "particle-horizon");
    const t = await loadTemplate(dir);
    const { existsSync } = await import("node:fs");
    expect(t.manifest.presets.map((p) => p.name)).toEqual([
      "Original",
      "Ice",
      "Ember",
      "Emerald",
      "Silver",
      "Prism",
    ]);
    expect(validateTemplate(t)).toEqual([]);
    for (const preset of t.manifest.presets) {
      expect(preset.thumbnail).toBe(`presets/${preset.name.toLowerCase()}.jpg`);
      expect(existsSync(path.join(dir, preset.thumbnail ?? ""))).toBe(true);
    }
  });
});

describe("Particle Horizon live preview", () => {
  it("has no hand-written fallback defaults", async () => {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(
      path.join(process.cwd(), "templates", "particle-horizon", "index.html"),
      "utf8",
    );
    expect(html).not.toMatch(/setting\("[^"]+",/);
  });
});
