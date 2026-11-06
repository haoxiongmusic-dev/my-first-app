// Where the app keeps its files (songs, analyses, images, backgrounds, exports, jobs):
// <project>/storage by default, or the folder in STORAGE_DIR (on the cloud machine, a disk that
// is kept between sessions). Every storage path in the app is built from this.
import path from "node:path";

export function storageRoot(
  projectRoot: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(projectRoot, "storage");
}
