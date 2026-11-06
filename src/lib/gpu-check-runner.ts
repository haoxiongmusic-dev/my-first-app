// The real GPU check render: one second of the sample song with Halo Rings, through the same
// job builder and HyperFrames command as an export (Draft). Started once when the server
// starts (src/instrumentation.ts).
import { rm } from "node:fs/promises";
import path from "node:path";
import { checkGpu, renderGpuArgs, setGpuStatus } from "@/lib/gpu-check";
import { prepareJob } from "@/lib/jobs";
import { runCommand } from "@/lib/run-command";
import { sampleSongId } from "@/lib/sample-song-id";
import { storageRoot } from "@/lib/storage-root";
import { defaultValues, loadTemplate } from "@/lib/templates";

const holder = globalThis as unknown as { __gpuCheckStarted?: boolean };

export function startGpuCheck(projectRoot: string = process.cwd()): void {
  if (holder.__gpuCheckStarted) return;
  holder.__gpuCheckStarted = true;
  void checkGpu(async () => {
    const songId = await sampleSongId(projectRoot);
    if (!songId) throw new Error("the sample song isn't available");
    const storage = storageRoot(projectRoot);
    const template = await loadTemplate(path.join(projectRoot, "templates", "halo-rings"));
    const jobDir = path.join(storage, "jobs", "gpu-check");
    await rm(jobDir, { recursive: true, force: true });
    try {
      const job = await prepareJob({
        template,
        song: {
          wavPath: path.join(storage, "songs", songId, "song.wav"),
          analysisPath: path.join(storage, "songs", songId, "analysis.json"),
        },
        values: defaultValues(template.variables),
        jobDir,
        storageRoot: storage,
        section: { start: 0, end: 1 },
        run: runCommand,
      });
      const raw = path.join(jobDir, "raw.mp4");
      const result = await runCommand("npx", [
        ...["hyperframes", "render", jobDir, "--variables-file", job.variablesPath],
        ...["--quality", "draft", "-o", raw, ...renderGpuArgs()],
      ]);
      return { code: result.code, output: `${result.stdout}\n${result.stderr}` };
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }, setGpuStatus);
}
