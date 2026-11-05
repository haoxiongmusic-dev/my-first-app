// `npm run sync:toolkit`: copy templates/shared/viz-toolkit.js into every template's assets/,
// and templates/shared/three-kit.js into the templates that load it.
import path from "node:path";
import { syncToolkit } from "../src/lib/toolkit-sync";

async function main(): Promise<void> {
  const written = await syncToolkit(path.join(process.cwd(), "templates"));
  if (written.length === 0) console.log("Every template already has the current shared scripts.");
  for (const file of written) console.log(`updated ${path.relative(process.cwd(), file)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
