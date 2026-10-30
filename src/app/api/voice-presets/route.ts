import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { voicePresetService } from "@/server/services/voice-preset-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const presets = await voicePresetService.listUserPresets(user.id);
    return NextResponse.json({ presets }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const body = await req.json();

    const preset = await voicePresetService.createPreset({
      userId: user.id,
      name: String(body.name ?? ""),
      jobId: body.jobId ? String(body.jobId) : undefined,
      assignments: Array.isArray(body.assignments)
        ? body.assignments
        : undefined,
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
