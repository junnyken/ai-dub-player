import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { translationService } from "@/server/services/translation-service";
import { handleApiError } from "@/server/http/api-response";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id, segmentId } = await context.params;
    const body = await req.json();

    const updated = await translationService.updateTranslationSegment({
      translationId: id,
      segmentId,
      userId: user.id,
      translatedText: String(body.translatedText ?? ""),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
