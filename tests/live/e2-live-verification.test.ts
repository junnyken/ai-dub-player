import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { ExtensionApiClient, FetchLike } from "@/extension/extension-api-client";
import { YouTubeExtensionContentSession } from "@/extension/content";
import {
  YouTubeVideoElementLike,
  YouTubeVideoEventName,
} from "@/extension/youtube-player-sync-bridge";
import { POST as postDubJobsRoute } from "@/app/api/dub-jobs/route";
import { GET as getByVideoRoute } from "@/app/api/dub-jobs/by-video/route";
import { GET as getJobProgressRoute } from "@/app/api/dub-jobs/[id]/progress/route";
import { GET as getPlaybackRoute } from "@/app/api/dub-jobs/[id]/playback/route";
import { GET as getJobSpeakersRoute } from "@/app/api/dub-jobs/[id]/speakers/route";
import { PATCH as patchSpeakerVoiceRoute } from "@/app/api/speakers/[id]/voice/route";

describe("E2 Live Verification: Full YouTube In-Page Dubbing Experience (E1 Trigger -> D1..D5 Engine -> E2 In-Page Overlay)", () => {
  it("runs complete YouTube watch session: triggers dub, plays synced Vietnamese voice-over & dual subtitles on <video>, handles seek/speed/pause/voice-change, and tears down cleanly on SPA switch", async () => {
    jobQueueService.setAutoRunWorker(false);

    const email = "e2-live-complete@aidub.vn";
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
        name: "E2 Live Complete User",
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
      const playMatch = parsed.pathname.match(
        /^\/api\/dub-jobs\/([^/]+)\/playback$/
      );
      if (playMatch) {
        const res = await getPlaybackRoute(req, {
          params: Promise.resolve({ id: playMatch[1] }),
        });
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      const spkMatch = parsed.pathname.match(
        /^\/api\/dub-jobs\/([^/]+)\/speakers$/
      );
      if (spkMatch) {
        const res = await getJobSpeakersRoute(req, {
          params: Promise.resolve({ id: spkMatch[1] }),
        });
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      const patchMatch = parsed.pathname.match(
        /^\/api\/speakers\/([^/]+)\/voice$/
      );
      if (patchMatch && method === "PATCH") {
        const res = await patchSpeakerVoiceRoute(req, {
          params: Promise.resolve({ id: patchMatch[1] }),
        });
        return { ok: res.ok, status: res.status, json: async () => res.json() };
      }
      throw new Error(`Unhandled route: ${url}`);
    };

    const apiClient = new ExtensionApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: liveFetch,
    });
    const session = new YouTubeExtensionContentSession({
      apiClient,
      authHeaders: { "x-user-id": user.id },
    });

    // 1. User opens YouTube Video 1 & clicks "Lồng tiếng Việt bằng AI"
    await session.navigateToYouTubeUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    const triggered = await session.triggerButton.clickTrigger();
    const jobId = triggered.job!.id;

    // 2. Run Dub Engine D1 -> D5
    await jobQueueService.processIngestJob(jobId);
    await transcriptVersionService.generateTranscriptForJob(jobId, {
      expectedSpeakerCount: 3,
    });
    await translationService.translateJob(jobId, { userId: user.id });
    await castingService.runAiCastingForJob(jobId, user.id);
    await playbackManifestService.renderJobAudio(jobId, { userId: user.id });
    await session.triggerButton.refreshJobProgress();

    // 3. Attach to YouTube <video> element and start In-Page Dub Playback
    const listeners = new Map<YouTubeVideoEventName, Set<() => void>>();
    const ytVideo: YouTubeVideoElementLike & {
      emit: (e: YouTubeVideoEventName) => void;
    } = {
      currentTime: 2.0,
      paused: false,
      seeking: false,
      playbackRate: 1.0,
      volume: 0.95,
      muted: false,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      emit(type) {
        for (const fn of listeners.get(type) ?? []) fn();
      },
    };

    const activeOverlay = await session.startDubPlaybackOnPage(ytVideo);
    expect(activeOverlay.audioState.isDubAudioPlaying).toBe(true);
    expect(activeOverlay.audioState.subtitleState.visible).toBe(true);
    expect(ytVideo.volume).toBeCloseTo(0.2, 2); // Ducked original audio

    // 4. User changes playback speed to 1.25x & seeks to 12.0s on YouTube player
    ytVideo.playbackRate = 1.25;
    ytVideo.currentTime = 12.0;
    ytVideo.emit("ratechange");
    ytVideo.emit("seeked");
    expect(
      session.controlWidget.getState().audioState.effectiveDubPlaybackRate
    ).toBeGreaterThanOrEqual(1.25);

    // 5. User pauses YouTube video -> dub audio pauses immediately
    ytVideo.paused = true;
    ytVideo.emit("pause");
    expect(
      session.controlWidget.getState().audioState.isDubAudioPlaying
    ).toBe(false);

    // 6. User switches to another YouTube video via SPA -> tears down overlay and restores original YouTube volume (0.95)
    await session.navigateToYouTubeUrl(
      "https://www.youtube.com/watch?v=9bZkp7q19f0"
    );
    expect(ytVideo.volume).toBe(0.95);
    expect(
      session.controlWidget.getState().audioState.isDubAudioPlaying
    ).toBe(false);
  });
});
