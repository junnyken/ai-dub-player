import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { translationService } from "@/server/services/translation-service";
import { handleApiError } from "@/server/http/api-response";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;

    let body: { glossaryEntries?: unknown[] } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const result = await translationService.translateJob(id, {
      userId: user.id,
      glossaryEntries: Array.isArray(body.glossaryEntries)
        ? (body.glossaryEntries as Parameters<
            typeof translationService.translateJob
          >[1] extends { glossaryEntries?: infer G }
            ? G
            : never)
        : undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
