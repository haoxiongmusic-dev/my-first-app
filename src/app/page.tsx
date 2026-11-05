// The gallery: one card per template (preview clips come in milestone 7).
import path from "node:path";
import Link from "next/link";
import { Suspense } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";
import { listTemplates } from "@/lib/templates";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-black px-6 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">{APP_NAME}</h1>
      <p className="text-lg text-zinc-400">{APP_TAGLINE}</p>
      <Suspense fallback={<p className="text-zinc-500">Loading templates…</p>}>
        <TemplateCards />
      </Suspense>
    </main>
  );
}

async function TemplateCards() {
  const templates = await listTemplates(path.join(process.cwd(), "templates"));
  return (
    <ul className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => {
        const thumbnail = t.manifest.presets[0]?.thumbnail;
        return (
          <li key={t.id}>
            <Link
              href={`/edit/${t.id}`}
              className="block overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-left hover:border-amber-500"
            >
              {thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element -- served by the preview route
                <img
                  src={`/preview/${t.id}/sample/${thumbnail}`}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              )}
              <div className="p-4">
                <h2 className="font-semibold text-zinc-100">{t.manifest.name}</h2>
                <p className="text-sm text-zinc-400">{t.manifest.description}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
