import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const manifest = await playbackManifestService.getPlaybackManifest(
      id,
      user.id
    );
    return NextResponse.json(manifest, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
