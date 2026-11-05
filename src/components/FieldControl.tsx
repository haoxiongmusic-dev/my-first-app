"use client";

// One setting in the form. The kind of control comes from the variable's type, so any
// template's settings get a form without template-specific code (spec §4, §6).
import { useId, useState } from "react";
import { parseFieldInput } from "@/lib/form-model";
import type { TemplateVariable } from "@/lib/template-values";

type Value = string | number | boolean;

type Props = {
  variable: TemplateVariable;
  value: Value;
  onChange: (value: Value) => void;
};

const inputClass =
  "w-full rounded border bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none";

/** "#f61" → "#ff6611", for the colour picker, which only understands 6 digits. */
function sixDigits(hex: string): string {
  return /^#[0-9a-f]{3}$/i.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
}

/** A text box that keeps the last valid value while the owner is still typing. */
function useDraft(variable: TemplateVariable, value: Value, onChange: (v: Value) => void) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  // When the value changes from outside (slider, reset), show it in the box.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
    setInvalid(false);
  }
  return {
    draft,
    invalid,
    edit(raw: string) {
      setDraft(raw);
      const parsed = parseFieldInput(variable, raw);
      setInvalid(parsed === null);
      if (parsed !== null && parsed !== value) onChange(parsed);
    },
    // On leaving the box, show the value actually in use (e.g. a number clamped to its range).
    settle() {
      setDraft(String(value));
      setInvalid(false);
    },
  };
}

function Control({ variable, value, onChange, id }: Props & { id: string }) {
  const draft = useDraft(variable, value, onChange);
  const border = draft.invalid ? "border-red-500" : "border-zinc-700 focus:border-zinc-500";

  switch (variable.type) {
    case "boolean":
      return (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={value === true}
          onClick={() => onChange(value !== true)}
          className={`relative h-6 w-11 rounded-full transition ${value === true ? "bg-amber-500" : "bg-zinc-700"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${value === true ? "left-5" : "left-0.5"}`}
          />
        </button>
      );
    case "enum":
      return (
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} border-zinc-700`}
        >
          {variable.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${variable.label} picker`}
            value={sixDigits(String(value))}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
          />
          <input
            id={id}
            value={draft.draft}
            onChange={(e) => draft.edit(e.target.value)}
            onBlur={draft.settle}
            spellCheck={false}
            className={`${inputClass} ${border} font-mono`}
          />
        </div>
      );
    case "number": {
      const min = variable.min ?? 0;
      const max = variable.max ?? 100;
      const step = variable.step ?? 1;
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            aria-label={`${variable.label} slider`}
            min={min}
            max={max}
            step={step}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />
          <input
            id={id}
            inputMode="decimal"
            value={draft.draft}
            onChange={(e) => draft.edit(e.target.value)}
            onBlur={draft.settle}
            className={`${inputClass} ${border} w-20 text-right`}
          />
          {variable.unit && <span className="w-6 text-xs text-zinc-500">{variable.unit}</span>}
        </div>
      );
    }
    case "string":
      return (
        <div className="space-y-1">
          <input
            id={id}
            value={draft.draft}
            maxLength={variable.maxLength}
            onChange={(e) => draft.edit(e.target.value)}
            onBlur={draft.settle}
            className={`${inputClass} ${border}`}
          />
          {variable.maxLength !== undefined && (
            <p className="text-right text-xs text-zinc-500">
              {draft.draft.length} / {variable.maxLength}
            </p>
          )}
        </div>
      );
  }
}

export function FieldControl(props: Props) {
  const id = useId();
  const isDefault = props.value === props.variable.default;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-zinc-300">
          {props.variable.label}
        </label>
        {!isDefault && (
          <button
            type="button"
            title="Reset to default"
            aria-label={`Reset ${props.variable.label}`}
            onClick={() => props.onChange(props.variable.default)}
            className="text-sm text-zinc-500 hover:text-amber-400"
          >
            ↺
          </button>
        )}
      </div>
      <Control {...props} id={id} />
    </div>
  );
}
