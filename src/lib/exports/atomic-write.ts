/**
 * Write a file so a crash never leaves half of it: write a temporary file, then rename it
 * into place.
 *
 * On Windows the rename is refused (EPERM / EACCES / EBUSY) while anything else has the file
 * open, for example the app reading an export's status at that very moment. That only lasts
 * a moment, so the rename is retried for up to about a second before giving up.
 */
import { rename, writeFile } from "node:fs/promises";

const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
const RETRY_DELAYS_MS = [10, 20, 40, 80, 160, 320, 480];

export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!BUSY.has(code) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}
