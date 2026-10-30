import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { handleApiError } from "@/server/http/api-response";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id, segmentId } = await context.params;
    const body = await req.json();

    const updated = await transcriptVersionService.updateSegment({
      transcriptId: id,
      segmentId,
      userId: user.id,
      sourceText: body.sourceText,
      speakerId: body.speakerId,
      needsReview: body.needsReview,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
