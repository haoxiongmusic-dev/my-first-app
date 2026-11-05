// The HyperFrames player and runtime, served from the pinned npm package (never a CDN).
import { readFile } from "node:fs/promises";
import path from "node:path";

const FILES: Record<string, string> = {
  "player.js": "hyperframes-player.global.js",
  "runtime.js": "hyperframe.runtime.iife.js",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const name = FILES[file];
  if (!name) return new Response("Not found", { status: 404 });
  const body = await readFile(
    path.join(process.cwd(), "node_modules", "hyperframes", "dist", name),
  );
  return new Response(body, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
