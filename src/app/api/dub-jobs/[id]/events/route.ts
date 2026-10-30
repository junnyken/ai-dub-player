import { NextRequest } from "next/server";
import { authService } from "@/server/auth/auth-service";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { handleApiError } from "@/server/http/api-response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authService.resolveUserFromRequest(req);
    const { id } = await context.params;
    const initialSnapshot = await dubJobOrchestrator.getJobProgress(id, user.id);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (payload: {
          jobId: string;
          status: string;
          progress: number;
          message: string;
          readyFromMs: number;
          readyToMs: number;
          errorCode?: string | null;
        }) => {
          const formatted = `data: ${JSON.stringify({
            jobId: payload.jobId,
            status: payload.status,
            progress: payload.progress,
            message: payload.message,
            readyFromMs: payload.readyFromMs,
            readyToMs: payload.readyToMs,
            ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
          })}\n\n`;
          try {
            controller.enqueue(encoder.encode(formatted));
          } catch {
            // Stream closed
          }
        };

        // Emit immediate snapshot upon connection
        sendEvent({
          jobId: initialSnapshot.jobId,
          status: initialSnapshot.status,
          progress: initialSnapshot.progress,
          message: initialSnapshot.message,
          readyFromMs: initialSnapshot.readyFromMs,
          readyToMs: initialSnapshot.readyToMs,
          errorCode: initialSnapshot.errorCode,
        });

        const unsubscribe = jobEventsBus.subscribe(id, (event) => {
          sendEvent(event);
        });

        req.signal.addEventListener("abort", () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Ignore close errors
          }
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
