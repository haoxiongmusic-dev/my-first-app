/**
 * Templates live in `templates/<id>/` as HyperFrames projects. Each one declares its settings
 * ("variables") on the `<html>` tag of `index.html`, and describes how the editor shows them
 * in `template.json` (spec §6). This module reads both and checks they follow the rules, so
 * the editor form can be generated instead of written by hand.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultValues,
  IMAGE_FITS,
  type ImageFit,
  type Template,
  TemplateError,
  type TemplateManifest,
  type TemplateValues,
  type TemplateVariable,
  validateValue,
  validateValues,
} from "@/lib/template-values";

export * from "@/lib/template-values";

const REQUIRED_IDS = ["title", "artist", "intensity"];
const TYPES = ["string", "number", "color", "boolean", "enum", "image"];

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function checkDeclaration(raw: unknown, index: number): TemplateVariable {
  if (typeof raw !== "object" || raw === null) {
    throw new TemplateError(`Variable ${index + 1} is not an object`);
  }
  const v = raw as Record<string, unknown>;
  const name = typeof v.id === "string" && v.id ? v.id : `#${index + 1}`;
  const fail = (why: string) => new TemplateError(`Variable "${name}": ${why}`);
  if (typeof v.id !== "string" || !v.id) throw fail("needs an id");
  if (typeof v.label !== "string") throw fail("needs a label");
  if (typeof v.type !== "string" || !TYPES.includes(v.type)) {
    throw fail(`unknown type "${String(v.type)}" (use ${TYPES.join(", ")})`);
  }
  if (!("default" in v)) throw fail("needs a default");
  if (v.type === "enum") {
    const options = v.options;
    const ok =
      Array.isArray(options) &&
      options.length > 0 &&
      options.every(
        (o) =>
          typeof o === "object" &&
          o !== null &&
          typeof (o as { value?: unknown }).value === "string" &&
          typeof (o as { label?: unknown }).label === "string",
      );
    if (!ok) throw fail("an enum needs options: [{value, label}, ...]");
  }
  if (v.type === "image") {
    if (!IMAGE_FITS.includes(v.fit as ImageFit)) {
      throw fail(`unknown image fit "${String(v.fit)}" (use ${IMAGE_FITS.join(", ")})`);
    }
    if (v.default !== "") throw fail(`an image's default must be ""`);
  }
  const variable = v as TemplateVariable;
  const problem = validateValue(variable, v.default);
  if (problem) throw fail(`bad default: ${problem}`);
  return variable;
}

/** The variables declared in `data-composition-variables='[…]'` on the `<html>` tag. */
export function parseVariables(html: string): TemplateVariable[] {
  const tag = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  const match = /data-composition-variables='([^']*)'/.exec(tag);
  if (!match) throw new TemplateError("index.html has no data-composition-variables on <html>");
  let list: unknown;
  try {
    list = JSON.parse(decodeEntities(match[1]));
  } catch (error) {
    throw new TemplateError(`data-composition-variables is not valid JSON: ${String(error)}`);
  }
  if (!Array.isArray(list)) throw new TemplateError("data-composition-variables must be a list");
  return list.map(checkDeclaration);
}

export function validateTemplate(t: Template): string[] {
  const problems: string[] = [];
  const ids = new Set(t.variables.map((v) => v.id));
  const { manifest } = t;

  for (const id of REQUIRED_IDS) {
    if (!ids.has(id)) problems.push(`Missing required setting "${id}"`);
  }

  const groupCount = new Map<string, number>();
  for (const group of manifest.groups) {
    for (const field of group.fields) {
      groupCount.set(field, (groupCount.get(field) ?? 0) + 1);
      if (!ids.has(field)) problems.push(`Group "${group.name}" lists unknown setting "${field}"`);
    }
  }
  for (const id of ids) {
    const count = groupCount.get(id) ?? 0;
    if (count === 0) problems.push(`Setting "${id}" is in no group`);
    if (count > 1) problems.push(`Setting "${id}" is in ${count} groups (must be exactly one)`);
  }

  for (const [list, name] of [
    [manifest.basic, "basic"],
    [manifest.content, "content"],
  ] as const) {
    for (const id of list) {
      if (!ids.has(id)) problems.push(`"${name}" lists unknown setting "${id}"`);
    }
  }

  for (const preset of manifest.presets) {
    for (const problem of validateValues(t.variables, preset.values)) {
      problems.push(`Preset "${preset.name}": ${problem}`);
    }
  }
  return problems;
}

function parseOverride(v: TemplateVariable, text: string): string | number | boolean {
  if (v.type === "number") return text.trim() === "" ? Number.NaN : Number(text);
  if (v.type === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
  }
  return text;
}

/**
 * The values to render with: defaults, then the preset's values, then single overrides
 * (given as text, e.g. from the command line). Throws TemplateError for anything invalid.
 */
export function resolveValues(
  t: Template,
  opts: { preset?: string; overrides?: Record<string, string> },
): TemplateValues {
  const values = defaultValues(t.variables);
  if (opts.preset !== undefined) {
    const preset = t.manifest.presets.find(
      (p) => p.name.toLowerCase() === opts.preset?.toLowerCase(),
    );
    if (!preset) {
      const names = t.manifest.presets.map((p) => p.name).join(", ") || "none";
      throw new TemplateError(`Unknown preset "${opts.preset}". Presets: ${names}`);
    }
    Object.assign(values, preset.values);
  }
  const byId = new Map(t.variables.map((v) => [v.id, v]));
  for (const [id, text] of Object.entries(opts.overrides ?? {})) {
    const v = byId.get(id);
    if (!v) {
      throw new TemplateError(`Unknown setting "${id}". Settings: ${[...byId.keys()].join(", ")}`);
    }
    values[id] = parseOverride(v, text);
  }
  const problems = validateValues(t.variables, values);
  if (problems.length > 0) throw new TemplateError(problems.join("; "));
  return values;
}

/** Read one template folder (index.html + template.json). */
export async function loadTemplate(dir: string): Promise<Template> {
  const id = path.basename(dir);
  const html = await readFile(path.join(dir, "index.html"), "utf8");
  let manifest: TemplateManifest;
  try {
    manifest = JSON.parse(await readFile(path.join(dir, "template.json"), "utf8"));
  } catch (error) {
    throw new TemplateError(`${id}/template.json can't be read: ${String(error)}`);
  }
  return { id, dir, manifest, variables: parseVariables(html) };
}

/** Every template under `root` (folders with a template.json, except `shared`). */
export async function listTemplates(root: string): Promise<Template[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && e.name !== "shared")
    .filter((e) => existsSync(path.join(root, e.name, "template.json")))
    .map((e) => e.name)
    .sort();
  return Promise.all(dirs.map((name) => loadTemplate(path.join(root, name))));
}
