import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { ExtensionApiClient, FetchLike } from "@/extension/extension-api-client";
import { InPageControlWidget } from "@/extension/in-page-control-widget";
import { YouTubeVideoElementLike } from "@/extension/youtube-player-sync-bridge";
import { GET as getPlaybackRoute } from "@/app/api/dub-jobs/[id]/playback/route";
import { GET as getJobSpeakersRoute } from "@/app/api/dub-jobs/[id]/speakers/route";
import { PATCH as patchSpeakerVoiceRoute } from "@/app/api/speakers/[id]/voice/route";

describe("E2 Integration & Regression: In-Page Dub Playback & Character Voice Swap on YouTube", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `E2 In-Page YouTube Dubbing (${videoId})`,
    durationSeconds: 36,
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);
  let userId = "";

  const inMemoryFetch: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    const req = new NextRequest(url, {
      method,
      headers: init?.headers as Record<string, string>,
      body: init?.body as BodyInit | undefined,
    });

    const playMatch = parsed.pathname.match(
      /^\/api\/dub-jobs\/([^/]+)\/playback$/
    );
    if (playMatch && method === "GET") {
      const res = await getPlaybackRoute(req, {
        params: Promise.resolve({ id: playMatch[1] }),
      });
      return { ok: res.ok, status: res.status, json: async () => res.json() };
    }

    const spkMatch = parsed.pathname.match(
      /^\/api\/dub-jobs\/([^/]+)\/speakers$/
    );
    if (spkMatch && method === "GET") {
      const res = await getJobSpeakersRoute(req, {
        params: Promise.resolve({ id: spkMatch[1] }),
      });
      return { ok: res.ok, status: res.status, json: async () => res.json() };
    }

    const patchVoiceMatch = parsed.pathname.match(
      /^\/api\/speakers\/([^/]+)\/voice$/
    );
    if (patchVoiceMatch && method === "PATCH") {
      const res = await patchSpeakerVoiceRoute(req, {
        params: Promise.resolve({ id: patchVoiceMatch[1] }),
      });
      return { ok: res.ok, status: res.status, json: async () => res.json() };
    }

    throw new Error(`Unhandled route in E2 integration test: ${method} ${url}`);
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
        email: "e2-integration@aidub.vn",
        name: "E2 Integration User",
        passwordHash: "hashed",
        plan: "pro",
        creditBalance: 100,
      },
    });
    userId = user.id;
  });

  it("loads Playback Manifest into YouTube in-page overlay, syncs with <video>, and swaps 1 speaker voice in-page without re-rendering other speakers", async () => {
    const job = await orchestrator.createJob({
      userId,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
      clientType: "extension",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 3,
    });
    await translationService.translateJob(job.id, { userId });
    await castingService.runAiCastingForJob(job.id, userId);
    await playbackManifestService.renderJobAudio(job.id, { userId });

    const apiClient = new ExtensionApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: inMemoryFetch,
    });

    const fakeVideo: YouTubeVideoElementLike = {
      currentTime: 2.0,
      paused: false,
      seeking: false,
      playbackRate: 1.0,
      volume: 1.0,
      muted: false,
    };

    const widget = new InPageControlWidget({
      apiClient,
      authHeaders: { "x-user-id": userId },
    });

    const initialState = await widget.activateInPageDubbing({
      jobId: job.id,
      videoElement: fakeVideo,
    });

    expect(initialState.degradedFallback).toBe(false);
    expect(initialState.audioState.isDubAudioPlaying).toBe(true);
    expect(initialState.speakers.length).toBe(3);

    const speaker1 = initialState.speakers[0];
    const speaker2 = initialState.speakers[1];

    // Change Speaker 1's voice directly from the in-page YouTube control widget
    const afterSwap = await widget.changeCharacterVoiceInPage({
      speakerId: speaker1.id,
      voiceId: "voice_vi_ha_adult_f",
    });

    const spk1Segs = afterSwap.manifest!.audioSegments.filter(
      (s) => s.speakerId === speaker1.id
    );
    const spk2Segs = afterSwap.manifest!.audioSegments.filter(
      (s) => s.speakerId === speaker2.id
    );

    expect(
      spk1Segs.every(
        (s) => s.version === 2 && s.voiceId === "voice_vi_ha_adult_f"
      )
    ).toBe(true);
    expect(spk2Segs.every((s) => s.version === 1)).toBe(true);
  });
});
