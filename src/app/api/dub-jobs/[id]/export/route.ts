import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { mediaExportService } from "@/server/services/media-export-service";
import { handleApiError } from "@/server/http/api-response";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const formatParam = req.nextUrl.searchParams.get("format");
    const format: "mp4" | "wav" = formatParam === "wav" ? "wav" : "mp4";
    const stemParam = req.nextUrl.searchParams.get("stem");
    const isolateBgmStem = stemParam !== "dry";
    const responseType = req.nextUrl.searchParams.get("responseType") || "binary";

    const exported = await mediaExportService.exportMasterMedia({
      jobId: id,
      userId: user.id,
      format,
      isolateBgmStem,
    });

    if (responseType === "json") {
      return NextResponse.json(
        {
          jobId: exported.jobId,
          format: exported.format,
          fileName: exported.fileName,
          mimeType: exported.mimeType,
          sizeBytes: exported.sizeBytes,
          durationMs: exported.durationMs,
          stemSeparationModel: exported.stemSeparationModel,
          isolateBgmStem: exported.isolateBgmStem,
          dataUri: exported.dataUri,
        },
        { status: 200 }
      );
    }

    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        "Content-Type": exported.mimeType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Content-Length": String(exported.sizeBytes),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
