// Presets: one-click looks. A preset resets the template's "look fields" (every field any
// preset sets) to their defaults, then applies its own values; other fields are kept.
import { describe, expect, it } from "vitest";
import type { FormTemplate } from "@/lib/form-model";
import { applyPreset, lookFields, presetMatches, sameSettingValue } from "@/lib/presets";
import type { TemplatePreset } from "@/lib/template-values";

const A: TemplatePreset = { name: "A", values: { mainColor: "#ff0000", speed: 2 } };
const B: TemplatePreset = { name: "B", values: { mainColor: "#00ff00", accentColor: "#f61" } };

const template: FormTemplate = {
  manifest: {
    name: "Test",
    description: "",
    groups: [],
    basic: [],
    content: [],
    presets: [A, B, { name: "Stray", values: { notDeclared: 1 } }],
  },
  variables: [
    { id: "title", type: "string", label: "Title", default: "Song" },
    { id: "mainColor", type: "color", label: "Main", default: "#ffffff" },
    { id: "accentColor", type: "color", label: "Accent", default: "#000000" },
    { id: "speed", type: "number", label: "Speed", default: 1 },
  ],
};

describe("presets", () => {
  it("look fields: every declared field some preset sets, in declaration order", () => {
    expect(lookFields(template)).toEqual(["mainColor", "accentColor", "speed"]);
  });

  it("applying a preset resets the other look fields and keeps the rest", () => {
    const values = { title: "Mine", mainColor: "#ff0000", accentColor: "#000000", speed: 2 };
    expect(applyPreset(template, values, B)).toEqual({
      title: "Mine",
      mainColor: "#00ff00",
      accentColor: "#f61",
      speed: 1,
    });
    expect(values.speed).toBe(2); // not changed in place
  });

  it("a preset matches until a look field changes", () => {
    const base = { title: "Song", mainColor: "#ffffff", accentColor: "#000000", speed: 1 };
    const applied = applyPreset(template, base, A);
    expect(presetMatches(template, applied, A)).toBe(true);
    expect(presetMatches(template, applied, B)).toBe(false);
    expect(presetMatches(template, { ...applied, title: "Other" }, A)).toBe(true);
    expect(presetMatches(template, { ...applied, speed: 3 }, A)).toBe(false);
  });

  it("matches 3-digit and 6-digit colours", () => {
    expect(sameSettingValue("#f61", "#FF6611")).toBe(true);
    expect(sameSettingValue("#ff6611", "#f61")).toBe(true);
    expect(sameSettingValue("#f61", "#f62")).toBe(false);
    expect(sameSettingValue(2, "2")).toBe(false);
    expect(sameSettingValue(true, true)).toBe(true);
  });

  it("the highlight follows a short colour in the values too", () => {
    const applied = applyPreset(template, {}, B);
    expect(presetMatches(template, { ...applied, accentColor: "#ff6611" }, B)).toBe(true);
  });
});
