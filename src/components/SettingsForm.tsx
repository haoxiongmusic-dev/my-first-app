"use client";

// The generated settings panels: the text fields on the Content tab, and Customize with a
// Basic tab (the few fields most people change) and an Advanced tab (every field, in groups).
import { useState } from "react";
import {
  advancedSections,
  basicFields,
  contentFields,
  type FieldModel,
  type FormTemplate,
} from "@/lib/form-model";
import type { TemplateValues } from "@/lib/template-values";
import { FieldControl } from "./FieldControl";

type Props = {
  template: FormTemplate;
  values: TemplateValues;
  setValue: (id: string, value: string | number | boolean) => void;
};

function Fields({ fields, values, setValue }: { fields: FieldModel[] } & Omit<Props, "template">) {
  return (
    <div className="space-y-4">
      {fields.map(({ variable }) => (
        <FieldControl
          key={variable.id}
          variable={variable}
          value={values[variable.id] ?? variable.default}
          onChange={(value) => setValue(variable.id, value)}
        />
      ))}
    </div>
  );
}

/** Content tab: the template's text fields (title, artist…). */
export function ContentFields({ template, values, setValue }: Props) {
  const fields = contentFields(template);
  if (fields.length === 0) return null;
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-zinc-200">Text</h3>
      <Fields fields={fields} values={values} setValue={setValue} />
    </section>
  );
}

/** Customize tab: Basic / Advanced. */
export function CustomizePanel({ template, values, setValue }: Props) {
  const [tab, setTab] = useState<"basic" | "advanced">("basic");
  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`;
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        <button
          role="tab"
          aria-selected={tab === "basic"}
          className={tabClass(tab === "basic")}
          onClick={() => setTab("basic")}
        >
          Basic
        </button>
        <button
          role="tab"
          aria-selected={tab === "advanced"}
          className={tabClass(tab === "advanced")}
          onClick={() => setTab("advanced")}
        >
          Advanced
        </button>
      </div>
      {tab === "basic" ? (
        <Fields fields={basicFields(template)} values={values} setValue={setValue} />
      ) : (
        advancedSections(template).map((section, i) => (
          <details
            key={section.title}
            open={i === 0}
            className="group rounded-lg border border-zinc-800 bg-zinc-900/60"
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-200">
              <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
              {section.title}
            </summary>
            <div className="px-4 pb-4">
              <Fields fields={section.fields} values={values} setValue={setValue} />
            </div>
          </details>
        ))
      )}
    </div>
  );
}
