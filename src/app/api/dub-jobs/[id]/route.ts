import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { handleApiError } from "@/server/http/api-response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const job = await dubJobOrchestrator.getJobDetails(id, user.id);
    return NextResponse.json(job, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
