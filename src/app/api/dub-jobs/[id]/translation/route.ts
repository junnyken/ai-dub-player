import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { translationService } from "@/server/services/translation-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const result = await translationService.getTranslationByJobId(id, user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
