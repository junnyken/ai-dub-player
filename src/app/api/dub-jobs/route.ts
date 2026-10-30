import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { handleApiError } from "@/server/http/api-response";
import { ClientType, SourceType, TargetLanguage } from "@/domain/models";

export async function GET(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const jobs = await dubJobOrchestrator.listUserJobs(user.id);
    return NextResponse.json({ jobs }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const body = await req.json();

    const created = await dubJobOrchestrator.createJob({
      userId: user.id,
      sourceType: body.sourceType as SourceType,
      sourceUrl: body.sourceUrl,
      sourceFileId: body.sourceFileId,
      targetLanguage: (body.targetLanguage ?? "vi") as TargetLanguage,
      clientType: (body.clientType ?? "web") as ClientType,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
