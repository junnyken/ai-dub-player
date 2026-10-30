import { NextRequest } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { subtitleService } from "@/server/services/subtitle-service";
import { handleApiError } from "@/server/http/api-response";
import { SubtitleTrackKind } from "@/domain/models";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);

    const rawKind = searchParams.get("kind") ?? "target";
    const kind: SubtitleTrackKind =
      rawKind === "source" || rawKind === "target" || rawKind === "bilingual"
        ? rawKind
        : "target";

    const rawFormat = (searchParams.get("format") ?? "vtt").toLowerCase();
    const format: "vtt" | "srt" | "ass" =
      rawFormat === "srt" || rawFormat === "ass" ? rawFormat : "vtt";

    const formatted = await subtitleService.getJobSubtitleFormatted({
      jobId: id,
      userId: user.id,
      kind,
      format,
    });

    return new Response(formatted.content, {
      status: 200,
      headers: {
        "Content-Type": formatted.mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
