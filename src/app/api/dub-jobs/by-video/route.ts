import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { handleApiError } from "@/server/http/api-response";
import { ValidationDomainError } from "@/domain/errors";

export async function GET(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
      throw new ValidationDomainError(
        "MISSING_VIDEO_ID",
        "Vui lòng truyền tham số videoId của YouTube."
      );
    }

    const existingJob = await dubJobOrchestrator.findLatestJobForYouTubeVideo(
      user.id,
      videoId
    );

    return NextResponse.json({ job: existingJob }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
