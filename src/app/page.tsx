import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">{APP_NAME}</h1>
      <p className="text-lg text-zinc-400">{APP_TAGLINE}</p>
    </main>
  );
}
