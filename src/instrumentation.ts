// Runs once when the server starts. On the online version (logins on) or with GPU_CHECK=1,
// starts the GPU check (one tiny render) in the background; GPU_CHECK=0 turns it off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { shouldCheckGpu } = await import("@/lib/gpu-check");
  if (!shouldCheckGpu()) return;
  const { startGpuCheck } = await import("@/lib/gpu-check-runner");
  startGpuCheck();
}
