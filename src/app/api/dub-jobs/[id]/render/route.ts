import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;

    let body: { speakerId?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const manifest = await playbackManifestService.renderJobAudio(id, {
      userId: user.id,
      onlySpeakerId: body.speakerId,
    });

    return NextResponse.json(manifest, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
