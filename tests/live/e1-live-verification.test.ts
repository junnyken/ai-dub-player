import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { YouTubePageDetector } from "@/extension/youtube-page-detector";
import { ExtensionApiClient, FetchLike } from "@/extension/extension-api-client";
import { InPageTriggerButton } from "@/extension/in-page-trigger-button";
import { ExtensionPopupController } from "@/extension/popup";
import { POST as postDubJobsRoute } from "@/app/api/dub-jobs/route";
import { GET as getByVideoRoute } from "@/app/api/dub-jobs/by-video/route";
import { GET as getJobProgressRoute } from "@/app/api/dub-jobs/[id]/progress/route";

describe("E1 Live Verification: YouTube Extension Trigger -> Progress -> Ready -> SPA Switch to Video 2", () => {
  it("detects YouTube watch page, triggers extension DubJob, tracks progress to ready, and resets on SPA switch to second video", async () => {
    jobQueueService.setAutoRunWorker(false);

    const email = "e1-live@aidub.vn";
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
    await prisma.user.deleteMany({ where: { email } });

    const user = await prisma.user.create({
      data: {
        email,
        name: "E1 Live Tester",
        passwordHash: "hashed",
        plan: "pro",
        creditBalance: 100,
      },
    });

    const liveFetch: FetchLike = async (url, init) => {
      const parsed = new URL(url);
      const method = init?.method ?? "GET";
      const req = new NextRequest(url, {
        method,
        headers: init?.headers as Record<string, string>,
        body: init?.body as BodyInit | undefined,
      });

      if (parsed.pathname === "/api/dub-jobs/by-video") {
        const res = await getByVideoRoute(req);
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      if (parsed.pathname === "/api/dub-jobs" && method === "POST") {
        const res = await postDubJobsRoute(req);
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      const progMatch = parsed.pathname.match(
        /^\/api\/dub-jobs\/([^/]+)\/progress$/
      );
      if (progMatch) {
        const res = await getJobProgressRoute(req, {
          params: Promise.resolve({ id: progMatch[1] }),
        });
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      throw new Error(`Unhandled route: ${url}`);
    };

    const detector = new YouTubePageDetector();
    const apiClient = new ExtensionApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: liveFetch,
    });
    const authHeaders = { "x-user-id": user.id };
    const triggerBtn = new InPageTriggerButton({
      detector,
      apiClient,
      authHeaders,
    });
    const popup = new ExtensionPopupController({
      detector,
      apiClient,
      authHeaders,
    });

    // 1. User opens YouTube Video 1
    await triggerBtn.syncWithUrl(
      "https://www.youtube.com/watch?v=M7lc1UVf-VE"
    );
    expect(triggerBtn.getState().phase).toBe("idle");

    // 2. Click "Lồng tiếng Việt bằng AI" on YouTube page
    const triggered = await triggerBtn.clickTrigger();
    expect(triggered.phase).toBe("processing");
    const jobId = triggered.job!.id;

    // 3. Run backend pipeline D1 -> D5
    await jobQueueService.processIngestJob(jobId);
    await transcriptVersionService.generateTranscriptForJob(jobId, {
      expectedSpeakerCount: 2,
    });
    await translationService.translateJob(jobId, { userId: user.id });
    await castingService.runAiCastingForJob(jobId, user.id);
    await playbackManifestService.renderJobAudio(jobId, { userId: user.id });

    // 4. Refresh progress in Extension -> transitions to "ready" ("Phát bằng tiếng Việt (AI)")
    const readyState = await triggerBtn.refreshJobProgress();
    expect(readyState.phase).toBe("ready");
    expect(readyState.buttonLabel).toBe("Phát bằng tiếng Việt (AI)");
    expect(readyState.webPlayerUrl).toContain(`/jobs/${jobId}`);

    const popupState = await popup.inspectActiveTab(
      "https://www.youtube.com/watch?v=M7lc1UVf-VE"
    );
    expect(popupState.canDub).toBe(true);
    expect(popupState.existingJob?.status).toBe("ready");

    // 5. Switch to YouTube Video 2 via SPA -> resets cleanly for Video 2
    const video2State = await triggerBtn.syncWithUrl(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    );
    expect(video2State.phase).toBe("idle");
    expect(video2State.videoId).toBe("jNQXAC9IVRw");
    expect(video2State.job).toBeNull();
  });
});
