/**
 * The settings form is generated from each template's declared variables and template.json
 * (spec §4, §6): no template has a hand-written form. These functions decide which fields go
 * where, and turn what the owner types into valid values. Safe to use in the browser.
 */
import {
  defaultValues,
  type ImageVariable,
  type Template,
  type TemplateValues,
  type TemplateVariable,
  validateValue,
} from "@/lib/template-values";

/** What the form needs from a template (not its folder on disk, which stays on the server). */
export type FormTemplate = Pick<Template, "manifest" | "variables">;

export type FieldModel = { variable: TemplateVariable };
export type FormSection = { title: string; fields: FieldModel[] };

/** The typed fields for these ids. Images are left out: they have their own upload cards. */
function fieldsFor(t: FormTemplate, ids: string[]): FieldModel[] {
  const byId = new Map(t.variables.map((v) => [v.id, v]));
  return ids.flatMap((id) => {
    const variable = byId.get(id);
    return variable && variable.type !== "image" ? [{ variable }] : [];
  });
}

/** Fields on the Content tab (text, in template.json "content" order). */
export function contentFields(t: FormTemplate): FieldModel[] {
  return fieldsFor(t, t.manifest.content);
}

/** Image settings, in declaration order: one upload card each on the Content tab. */
export function imageFields(t: FormTemplate): ImageVariable[] {
  return t.variables.filter((v): v is ImageVariable => v.type === "image");
}

/** Fields on Customize → Basic (template.json "basic" order). */
export function basicFields(t: FormTemplate): FieldModel[] {
  return fieldsFor(t, t.manifest.basic);
}

/** Customize → Advanced: every typed field, one section per template.json group. */
export function advancedSections(t: FormTemplate): FormSection[] {
  return t.manifest.groups
    .map((g) => ({ title: g.name, fields: fieldsFor(t, g.fields) }))
    .filter((section) => section.fields.length > 0);
}

/**
 * Turn raw input into a value for the variable, or null if it isn't valid yet (e.g. a half-typed
 * colour). Numbers are clamped to their range (when leaving the box) or, with `clamp: false`
 * (while typing), treated as not valid yet: typing 50 passes through "5", which must not jump
 * to the minimum. Text is cut to its maximum length.
 */
export function parseFieldInput(
  v: TemplateVariable,
  raw: string | boolean,
  options: { clamp?: boolean } = {},
): string | number | boolean | null {
  switch (v.type) {
    case "boolean":
      return typeof raw === "boolean" ? raw : null;
    case "number": {
      if (typeof raw !== "string" || raw.trim() === "") return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const min = v.min ?? -Infinity;
      const max = v.max ?? Infinity;
      if (options.clamp === false) return n >= min && n <= max ? n : null;
      return Math.min(max, Math.max(min, n));
    }
    case "color": {
      const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return validateValue(v, value) === null ? value : null;
    }
    case "enum":
      return typeof raw === "string" && validateValue(v, raw) === null ? raw : null;
    case "string":
      return typeof raw === "string" ? raw.slice(0, v.maxLength ?? raw.length) : null;
    case "image":
      return typeof raw === "string" && validateValue(v, raw) === null ? raw : null;
  }
}

/** Defaults, with any valid saved values on top; unknown or invalid saved values are dropped. */
export function mergeValues(t: FormTemplate, saved: Record<string, unknown>): TemplateValues {
  const values = defaultValues(t.variables);
  for (const v of t.variables) {
    if (v.id in saved && validateValue(v, saved[v.id]) === null) {
      values[v.id] = saved[v.id] as string | number | boolean;
    }
  }
  return values;
}
