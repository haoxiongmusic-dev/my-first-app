// `npm run template:assets`: put the generated sample song into every template's assets/
// folder (git-ignored) and update the toolkit copies, so templates work in place.
import path from "node:path";
import { runCommand } from "../src/lib/run-command";
import { ensureTemplateAssets } from "../src/lib/template-assets";

async function main(): Promise<void> {
  const changed = await ensureTemplateAssets(process.cwd(), runCommand);
  if (changed.length === 0) console.log("Template assets are already up to date.");
  for (const file of changed) console.log(`updated ${path.relative(process.cwd(), file)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
