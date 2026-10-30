import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { voicePreviewService } from "@/server/services/voice-preview-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;

    let body: { voiceId?: string; sampleText?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const preview = await voicePreviewService.generateSpeakerVoicePreview({
      speakerId: id,
      userId: user.id,
      voiceId: body.voiceId,
      sampleText: body.sampleText,
    });

    return NextResponse.json(preview, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
