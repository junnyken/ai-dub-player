import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { jobQueueService } from "@/server/services/job-queue";
import { YouTubePageDetector } from "@/extension/youtube-page-detector";
import { ExtensionApiClient, FetchLike } from "@/extension/extension-api-client";
import { InPageTriggerButton } from "@/extension/in-page-trigger-button";
import { POST as postDubJobsRoute } from "@/app/api/dub-jobs/route";
import { GET as getByVideoRoute } from "@/app/api/dub-jobs/by-video/route";
import { GET as getJobProgressRoute } from "@/app/api/dub-jobs/[id]/progress/route";

describe("E1 Integration & Regression: Chrome Extension Trigger, Duplicate Guard & SPA Video Switch", () => {
  let userId = "";

  const inMemoryFetch: FetchLike = async (url, init) => {
    const parsedUrl = new URL(url);
    const method = init?.method ?? "GET";
    const req = new NextRequest(url, {
      method,
      headers: init?.headers as Record<string, string>,
      body: init?.body as BodyInit | undefined,
    });

    if (parsedUrl.pathname === "/api/dub-jobs/by-video" && method === "GET") {
      const res = await getByVideoRoute(req);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => res.json(),
      };
    }

    if (parsedUrl.pathname === "/api/dub-jobs" && method === "POST") {
      const res = await postDubJobsRoute(req);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => res.json(),
      };
    }

    const progressMatch = parsedUrl.pathname.match(
      /^\/api\/dub-jobs\/([^/]+)\/progress$/
    );
    if (progressMatch && method === "GET") {
      const res = await getJobProgressRoute(req, {
        params: Promise.resolve({ id: progressMatch[1] }),
      });
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => res.json(),
      };
    }

    throw new Error(`Unhandled route in test fetch: ${method} ${url}`);
  };

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
    await prisma.audioSegment.deleteMany();
    await prisma.subtitleTrack.deleteMany();
    await prisma.voiceAssignment.deleteMany();
    await prisma.voicePreset.deleteMany();
    await prisma.translationSegment.deleteMany();
    await prisma.translation.deleteMany();
    await prisma.glossaryEntry.deleteMany();
    await prisma.transcriptSegmentRevision.deleteMany();
    await prisma.transcriptSegment.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.speaker.deleteMany();
    await prisma.jobEventLog.deleteMany();
    await prisma.creditLedger.deleteMany();
    await prisma.jobQueueRecord.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.dubJob.deleteMany();
    await prisma.uploadedFile.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: "e1-extension@aidub.vn",
        name: "E1 Extension User",
        passwordHash: "hashed",
        plan: "pro",
        creditBalance: 100,
      },
    });
    userId = user.id;
  });

  it("Regression: clicking trigger multiple times creates strictly 1 DubJob (clientType='extension') and SPA navigation resets state for Video 2", async () => {
    const detector = new YouTubePageDetector();
    const apiClient = new ExtensionApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: inMemoryFetch,
    });
    const triggerButton = new InPageTriggerButton({
      detector,
      apiClient,
      authHeaders: { "x-user-id": userId },
    });

    // 1. Open YouTube Video 1
    const stateIdle = await triggerButton.syncWithUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(stateIdle.phase).toBe("idle");
    expect(stateIdle.videoId).toBe("dQw4w9WgXcQ");

    // 2. Rapidly click trigger button twice -> must create strictly 1 job in DB
    const [click1, click2] = await Promise.all([
      triggerButton.clickTrigger(),
      triggerButton.clickTrigger(),
    ]);

    expect(click1.job?.id).toBeDefined();
    expect(click2.job?.id).toBe(click1.job?.id);

    const dbJobsForVideo1 = await prisma.dubJob.findMany({
      where: { userId, sourceVideoId: "dQw4w9WgXcQ" },
    });
    expect(dbJobsForVideo1).toHaveLength(1);
    expect(dbJobsForVideo1[0].clientType).toBe("extension");

    // 3. SPA navigation to Video 2 -> button state must reset cleanly to 'idle' for Video 2
    const stateVideo2 = await triggerButton.syncWithUrl(
      "https://www.youtube.com/watch?v=9bZkp7q19f0"
    );
    expect(stateVideo2.phase).toBe("idle");
    expect(stateVideo2.videoId).toBe("9bZkp7q19f0");
    expect(stateVideo2.job).toBeNull();

    // 4. Navigating back to Video 1 via SPA automatically restores Video 1's active job without creating a new job
    const stateBackToVideo1 = await triggerButton.syncWithUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(stateBackToVideo1.phase).toBe("processing");
    expect(stateBackToVideo1.job?.id).toBe(dbJobsForVideo1[0].id);
  });
});
