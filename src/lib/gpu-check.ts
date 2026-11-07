// The start-up GPU check (the online version): one tiny render tells whether HyperFrames drew
// with the machine's graphics chip ("hardware gpu" in its summary) or fell back to slow
// software drawing ("software gpu"). The editor shows the answer. It runs only on the online
// version (logins on) or when asked with GPU_CHECK=1, so the owner's PC never spends a render.
import { loginEnabled } from "@/lib/auth/gate";
export type GpuMode = "hardware" | "software";
export type GpuStatus = {
  gpu: "off" | "checking" | GpuMode | "failed";
  /** how long the check render took, seconds */
  seconds: number | null;
};

/** Which way HyperFrames drew, from its render summary line. */
export function parseGpuMode(output: string): GpuMode | null {
  const match = /\b(hardware|software) gpu\b/.exec(output);
  return match ? (match[1] as GpuMode) : null;
}

/** Extra render flags: let Chrome use the NVIDIA GPU when RENDER_GPU=1 (the cloud machine). */
export function renderGpuArgs(env: Record<string, string | undefined> = process.env): string[] {
  return env.RENDER_GPU === "1" ? ["--browser-gpu"] : [];
}

/** Whether to run the check at start-up: on the online version or when asked, never with 0. */
export function shouldCheckGpu(env: Record<string, string | undefined> = process.env): boolean {
  if (env.GPU_CHECK === "0") return false;
  return env.GPU_CHECK === "1" || loginEnabled(env.ACCOUNTS);
}

/** Run one check render and report its status (checking, then the result). */
export async function checkGpu(
  render: () => Promise<{ code: number; output: string }>,
  report: (status: GpuStatus) => void,
  now: () => number = Date.now,
): Promise<void> {
  report({ gpu: "checking", seconds: null });
  const started = now();
  try {
    const { code, output } = await render();
    const mode = code === 0 ? parseGpuMode(output) : null;
    const seconds = Math.round((now() - started) / 100) / 10;
    report(mode ? { gpu: mode, seconds } : { gpu: "failed", seconds });
  } catch (error) {
    console.error("GPU check failed:", error);
    report({ gpu: "failed", seconds: null });
  }
}

const holder = globalThis as unknown as {
  __gpuStatus?: GpuStatus;
  __gpuWaiters?: (() => void)[];
};

/** The latest check result ("off" when no check was started). */
export function getGpuStatus(): GpuStatus {
  return holder.__gpuStatus ?? { gpu: "off", seconds: null };
}

export function setGpuStatus(status: GpuStatus): void {
  holder.__gpuStatus = status;
  if (status.gpu === "checking") return;
  const waiters = holder.__gpuWaiters ?? [];
  holder.__gpuWaiters = [];
  for (const release of waiters) release();
}

/**
 * Resolves once no check is running: at once, or when the running check reports any result
 * (a failed check too). Exports wait on it so they don't render alongside the check.
 */
export function gpuCheckDone(): Promise<void> {
  if (getGpuStatus().gpu !== "checking") return Promise.resolve();
  return new Promise((resolve) => {
    holder.__gpuWaiters = [...(holder.__gpuWaiters ?? []), resolve];
  });
}
