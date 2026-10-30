import { NextResponse } from "next/server";
import { voiceCatalogService } from "@/server/services/voice-catalog-service";
import { genreCadenceEngine } from "@/server/services/genre-cadence-engine";

export async function GET() {
  const voices = await voiceCatalogService.listVoices({ language: "vi" });
  const genres = genreCadenceEngine.listAllProfiles().map((g) => ({
    id: g.id,
    displayNameVi: g.displayNameVi,
    targetMsPerSyllable: g.targetMsPerSyllable,
  }));

  return NextResponse.json(
    {
      status: "ok",
      service: "ai-dub-player",
      version: "1.0.0",
      activeVoicesCount: voices.length,
      supportedGenres: genres,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
    },
  });
}
