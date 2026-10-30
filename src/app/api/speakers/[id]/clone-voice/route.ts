import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { mediaExportService } from "@/server/services/media-export-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const result = await mediaExportService.cloneSpeakerVoice({
      speakerId: id,
      userId: user.id,
      customVoiceName:
        typeof body.customVoiceName === "string"
          ? body.customVoiceName
          : undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
