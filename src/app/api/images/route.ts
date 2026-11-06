// PUT /api/images?fit=square: upload a picture for an image setting (raw body, name in
// `x-file-name`). It is converted once for that fit and kept by fingerprint; replies { id }.
import { requireLogin } from "@/lib/auth/require-login";
import { uploadImageResponse } from "@/lib/images";
import { runCommand } from "@/lib/run-command";
import { storageRoot } from "@/lib/storage-root";

export async function PUT(request: Request): Promise<Response> {
  // The proxy leaves upload routes alone (it would cut bodies at 10 MB): check the login here.
  const denied = requireLogin(request);
  if (denied) return denied;
  return uploadImageResponse(request, storageRoot(process.cwd()), runCommand);
}
