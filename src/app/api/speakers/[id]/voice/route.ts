import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { castingService } from "@/server/services/casting-service";
import { handleApiError } from "@/server/http/api-response";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const body = await req.json();

    const updated = await castingService.assignSpeakerVoice({
      speakerId: id,
      voiceId: String(body.voiceId ?? ""),
      userId: user.id,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
