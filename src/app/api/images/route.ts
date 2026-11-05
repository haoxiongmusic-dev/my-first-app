// PUT /api/images?fit=square: upload a picture for an image setting (raw body, name in
// `x-file-name`). It is converted once for that fit and kept by fingerprint; replies { id }.
import path from "node:path";
import { uploadImageResponse } from "@/lib/images";
import { runCommand } from "@/lib/run-command";

export function PUT(request: Request): Promise<Response> {
  return uploadImageResponse(request, path.join(process.cwd(), "storage"), runCommand);
}
