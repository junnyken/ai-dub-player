import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { handleApiError } from "@/server/http/api-response";
import { SourceType } from "@/domain/models";

export async function POST(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const body = await req.json();

    const result = await dubJobOrchestrator.estimateJob({
      userId: user.id,
      sourceType: body.sourceType as SourceType,
      sourceUrl: body.sourceUrl,
      sourceFileId: body.sourceFileId,
      targetLanguage: body.targetLanguage ?? "vi",
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
