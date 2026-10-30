import { NextRequest, NextResponse } from "next/server";
import { voiceCatalogService } from "@/server/services/voice-catalog-service";
import { handleApiError } from "@/server/http/api-response";
import { EstimatedAgeGroup, VoiceGenderPresentation } from "@/domain/models";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const language = searchParams.get("language") ?? "vi";
    const genderPresentation = searchParams.get("gender") as
      | VoiceGenderPresentation
      | null;
    const ageGroup = searchParams.get("ageGroup") as EstimatedAgeGroup | null;
    const styleTag = searchParams.get("styleTag") ?? undefined;

    const voices = await voiceCatalogService.listVoices({
      language,
      genderPresentation: genderPresentation || undefined,
      ageGroup: ageGroup || undefined,
      styleTag,
    });

    return NextResponse.json({ voices }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
