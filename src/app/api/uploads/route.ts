import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { handleApiError } from "@/server/http/api-response";
import { ValidationDomainError } from "@/domain/errors";

export async function POST(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const formData = await req.formData();

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      throw new ValidationDomainError(
        "MISSING_UPLOAD_FILE",
        "Vui lòng đính kèm file video hoặc âm thanh cần tải lên."
      );
    }

    const rightsConfirmedRaw = formData.get("rightsConfirmed");
    const rightsConfirmed =
      rightsConfirmedRaw === "true" || rightsConfirmedRaw === "1";

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const staged = await dubJobOrchestrator.stageUpload({
      userId: user.id,
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      buffer,
      rightsConfirmed,
    });

    return NextResponse.json(staged, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
