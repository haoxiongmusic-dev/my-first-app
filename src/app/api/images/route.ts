// PUT /api/images?fit=square: upload a picture for an image setting (raw body, name in
// `x-file-name`). It is converted once for that fit and kept by fingerprint; replies { id }.
import { uploadImageResponse } from "@/lib/images";
import { runCommand } from "@/lib/run-command";
import { storageRoot } from "@/lib/storage-root";

export function PUT(request: Request): Promise<Response> {
  return uploadImageResponse(request, storageRoot(process.cwd()), runCommand);
}
