import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubQualityAuditor } from "@/server/services/dub-quality-auditor";
import { handleApiError } from "@/server/http/api-response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const report = await dubQualityAuditor.generateQualityReport({
      jobId: id,
      userId: user.id,
    });
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const report = await dubQualityAuditor.autoOptimizeJobCadence({
      jobId: id,
      userId: user.id,
    });
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
