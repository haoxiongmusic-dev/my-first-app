/**
 * The parts of a template's settings that need no file access: types, value checks and
 * defaults. Kept separate from templates.ts so browser code (the settings form) can use them.
 */

const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** How an uploaded picture is shaped for a template. "square": 1024×1024, cropped from the centre. */
export type ImageFit = "square";
export const IMAGE_FITS: readonly ImageFit[] = ["square"];
/** An uploaded picture's id: the 64-character hex fingerprint of the file. */
export const IMAGE_ID = /^[0-9a-f]{64}$/;

type VariableBase = { id: string; label: string };

export type TemplateVariable =
  | (VariableBase & { type: "string"; default: string; maxLength?: number; placeholder?: string })
  | (VariableBase & {
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    })
  | (VariableBase & { type: "color"; default: string })
  | (VariableBase & { type: "boolean"; default: boolean })
  | (VariableBase & {
      type: "enum";
      default: string;
      options: { value: string; label: string }[];
    })
  /** A picture the user uploads. Its value is an image id, or "" for none. */
  | (VariableBase & { type: "image"; default: ""; fit: ImageFit });

export type ImageVariable = Extract<TemplateVariable, { type: "image" }>;

export type TemplateValues = Record<string, string | number | boolean>;
export type TemplatePreset = { name: string; thumbnail?: string; values: TemplateValues };
export type TemplateManifest = {
  name: string;
  description: string;
  /** gallery preview clip (milestone 7) */
  preview?: string;
  groups: { name: string; fields: string[] }[];
  basic: string[];
  content: string[];
  presets: TemplatePreset[];
};
export type Template = {
  id: string;
  dir: string;
  manifest: TemplateManifest;
  variables: TemplateVariable[];
};

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

/** null if `value` suits the variable, otherwise why not. */
export function validateValue(v: TemplateVariable, value: unknown): string | null {
  switch (v.type) {
    case "string":
      if (typeof value !== "string") return "must be text";
      if (v.maxLength !== undefined && value.length > v.maxLength) {
        return `must be at most ${v.maxLength} characters`;
      }
      return null;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "must be a number";
      if (v.min !== undefined && value < v.min) return `must be at least ${v.min}`;
      if (v.max !== undefined && value > v.max) return `must be at most ${v.max}`;
      return null;
    case "color":
      return typeof value === "string" && COLOR.test(value)
        ? null
        : "must be a colour like #ff6a12";
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "enum":
      return v.options.some((o) => o.value === value)
        ? null
        : `must be one of ${v.options.map((o) => o.value).join(", ")}`;
    case "image":
      return value === "" || (typeof value === "string" && IMAGE_ID.test(value))
        ? null
        : "must be an uploaded image";
  }
}

/** Where the live preview finds an uploaded picture ("" stays "": no picture). */
export function imagePreviewUrl(id: string, fit: ImageFit): string {
  return id === "" ? "" : `/api/images/${id}/${fit}.jpg`;
}

/** Problems with a set of values: unknown ids and values that don't suit their variable. */
export function validateValues(
  vars: TemplateVariable[],
  values: Record<string, unknown>,
): string[] {
  const byId = new Map(vars.map((v) => [v.id, v]));
  const problems: string[] = [];
  for (const [id, value] of Object.entries(values)) {
    const v = byId.get(id);
    if (!v) {
      problems.push(`Unknown setting "${id}"`);
      continue;
    }
    const problem = validateValue(v, value);
    if (problem) problems.push(`${id} ${problem}`);
  }
  return problems;
}

/** Each variable's default value. */
export function defaultValues(vars: TemplateVariable[]): TemplateValues {
  return Object.fromEntries(vars.map((v) => [v.id, v.default]));
}
