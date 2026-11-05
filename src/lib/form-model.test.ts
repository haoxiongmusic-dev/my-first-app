import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  advancedSections,
  basicFields,
  contentFields,
  mergeValues,
  parseFieldInput,
} from "@/lib/form-model";
import { defaultValues, loadTemplate, type Template, type TemplateVariable } from "@/lib/templates";

let ph: Template;
beforeAll(async () => {
  ph = await loadTemplate(path.join(process.cwd(), "templates", "particle-horizon"));
});

const ids = (fields: { variable: TemplateVariable }[]) => fields.map((f) => f.variable.id);
const variable = (id: string) => ph.variables.find((v) => v.id === id) as TemplateVariable;

describe("form model", () => {
  it("contentFields and basicFields follow template.json order", () => {
    expect(ids(contentFields(ph))).toEqual(["title", "artist"]);
    expect(ids(basicFields(ph))).toEqual([
      "mainColor",
      "intensity",
      "font",
      "showBackground",
      "backgroundBlur",
      "densityY",
      "densityX",
    ]);
  });

  it("advancedSections has one section per group, in order", () => {
    const sections = advancedSections(ph);
    expect(sections.map((s) => s.title)).toEqual(["Text", "Colors", "Effects", "Wave", "Audio"]);
    expect(sections[3].fields).toHaveLength(6);
  });

  it("parseFieldInput clamps numbers and rejects bad colours", () => {
    expect(parseFieldInput(variable("densityX"), "500")).toBe(200);
    expect(parseFieldInput(variable("densityX"), "10")).toBe(25);
    expect(parseFieldInput(variable("densityX"), "")).toBeNull();
    expect(parseFieldInput(variable("densityX"), "abc")).toBeNull();
    expect(parseFieldInput(variable("mainColor"), "#FFF")).toBe("#fff");
    expect(parseFieldInput(variable("mainColor"), "red")).toBeNull();
    expect(parseFieldInput(variable("spectrumBoost"), "9")).toBeNull();
    expect(parseFieldInput(variable("spectrumBoost"), "4")).toBe("4");
    expect(parseFieldInput(variable("letterbox"), false)).toBe(false);
    const short: TemplateVariable = {
      id: "s",
      type: "string",
      label: "S",
      default: "",
      maxLength: 3,
    };
    expect(parseFieldInput(short, "abcdef")).toBe("abc");
  });

  it("mergeValues keeps valid saved values and ignores the rest", () => {
    const merged = mergeValues(ph, { intensity: 1.5, mainColor: "nope", gone: 1 });
    expect(merged.intensity).toBe(1.5);
    expect(merged.mainColor).toBe(defaultValues(ph.variables).mainColor);
    expect("gone" in merged).toBe(false);
  });
});
