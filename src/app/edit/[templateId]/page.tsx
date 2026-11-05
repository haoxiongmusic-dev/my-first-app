// /edit/<templateId>: the editor for one template.
import { existsSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Editor } from "@/components/Editor";
import { loadTemplate } from "@/lib/templates";

export default function EditPage({ params }: { params: Promise<{ templateId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Opening the editor…
        </div>
      }
    >
      <EditorLoader params={params} />
    </Suspense>
  );
}

async function EditorLoader({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const dir = path.join(process.cwd(), "templates", templateId);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(templateId) || !existsSync(path.join(dir, "template.json"))) {
    notFound();
  }
  const template = await loadTemplate(dir);
  // Only what the browser needs: not the template's folder on disk.
  return (
    <Editor
      template={{ id: template.id, manifest: template.manifest, variables: template.variables }}
    />
  );
}
