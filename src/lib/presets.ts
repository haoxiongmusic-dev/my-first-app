/**
 * Presets: named one-click looks per template (spec §4.1; M7 spec §3). A template's "look
 * fields" are every declared field that any of its presets sets. Picking a preset puts those
 * fields back to their defaults, then applies the preset, so switching from one preset to
 * another never leaves the first one's extras behind; the title, pictures and other fields
 * stay as they are. Safe to use in the browser.
 */
import type { FormTemplate } from "@/lib/form-model";
import type { TemplatePreset, TemplateValues } from "@/lib/template-values";

type Value = string | number | boolean | undefined;

/** Every declared field some preset sets, in declaration order. */
export function lookFields(t: FormTemplate): string[] {
  const set = new Set(t.manifest.presets.flatMap((p) => Object.keys(p.values)));
  return t.variables.filter((v) => set.has(v.id)).map((v) => v.id);
}

/** What each look field becomes when this preset is picked. */
function presetLook(t: FormTemplate, preset: TemplatePreset): TemplateValues {
  const look: TemplateValues = {};
  const fields = new Set(lookFields(t));
  for (const v of t.variables) {
    if (!fields.has(v.id)) continue;
    look[v.id] = v.id in preset.values ? preset.values[v.id] : v.default;
  }
  return look;
}

/** The values after picking this preset (a new object). */
export function applyPreset(
  t: FormTemplate,
  values: TemplateValues,
  preset: TemplatePreset,
): TemplateValues {
  return { ...values, ...presetLook(t, preset) };
}

/** Is this preset's look what the values show now? */
export function presetMatches(
  t: FormTemplate,
  values: TemplateValues,
  preset: TemplatePreset,
): boolean {
  const look = presetLook(t, preset);
  return Object.keys(look).every((id) => sameSettingValue(values[id], look[id]));
}

const SHORT_HEX = /^#[0-9a-f]{3}$/i;
const HEX = /^#[0-9a-f]{6}$/i;

function fullHex(value: string): string | null {
  if (SHORT_HEX.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  }
  return HEX.test(value) ? value.toLowerCase() : null;
}

/** Equal settings; colours compare without case and with #abc meaning #aabbcc. */
export function sameSettingValue(a: Value, b: Value): boolean {
  if (typeof a === "string" && typeof b === "string") {
    const ha = fullHex(a);
    const hb = fullHex(b);
    if (ha !== null && hb !== null) return ha === hb;
  }
  return a === b;
}
