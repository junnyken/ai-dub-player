import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;

    await transcriptVersionService.generateTranscriptForJob(id, {
      userId: user.id,
    });
    await translationService.translateJob(id, {
      userId: user.id,
    });
    await castingService.runAiCastingForJob(id, user.id);
    const manifest = await playbackManifestService.renderJobAudio(id, {
      userId: user.id,
    });

    return NextResponse.json(manifest, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
