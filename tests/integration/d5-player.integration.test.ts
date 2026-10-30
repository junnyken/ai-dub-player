import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { POST as renderRoute } from "@/app/api/dub-jobs/[id]/render/route";
import { GET as playbackRoute } from "@/app/api/dub-jobs/[id]/playback/route";
import { GET as subtitlesRoute } from "@/app/api/dub-jobs/[id]/subtitles/route";
import { PATCH as patchSpeakerVoiceRoute } from "@/app/api/speakers/[id]/voice/route";
import { audioSegmentScheduler } from "@/server/services/audio-mixer";

describe("D5 Integration & Regression: Render, Playback Manifest, Subtitles & Isolated Speaker Re-synthesis", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `D5 Studio Dubbing Video (${videoId})`,
    durationSeconds: 36,
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);
  let userId = "";

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
        email: "d5-integration@aidub.vn",
        name: "D5 Integration User",
        passwordHash: "hashed",
        plan: "pro",
        creditBalance: 100,
      },
    });
    userId = user.id;
  });

  it("renders TTS segments, serves /playback and /subtitles?format=vtt, and re-renders ONLY the changed speaker's segments on voice change", async () => {
    const job = await orchestrator.createJob({
      userId,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
      clientType: "web",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 3,
    });
    await translationService.translateJob(job.id, { userId });
    await castingService.runAiCastingForJob(job.id, userId);

    // 1. Trigger POST /api/dub-jobs/:id/render
    const renderReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/render`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({}),
      }
    );
    const renderRes = await renderRoute(renderReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(renderRes.status).toBe(200);
    const manifest1 = await renderRes.json();
    expect(manifest1.status).toBe("ready");
    expect(manifest1.audioSegments.length).toBeGreaterThanOrEqual(3);
    expect(
      manifest1.audioSegments.every((s: { version: number }) => s.version === 1)
    ).toBe(true);

    // 2. Verify GET /api/dub-jobs/:id/playback matches Section 5 contract
    const playbackReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/playback`,
      {
        method: "GET",
        headers: { "x-user-id": userId },
      }
    );
    const playbackRes = await playbackRoute(playbackReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(playbackRes.status).toBe(200);
    const playbackBody = await playbackRes.json();
    expect(playbackBody.jobId).toBe(job.id);
    expect(playbackBody.subtitles.targetVtt).toContain("/subtitles?format=vtt");

    // 3. Verify GET /api/dub-jobs/:id/subtitles?format=vtt&kind=bilingual
    const vttReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/subtitles?format=vtt&kind=bilingual`,
      {
        method: "GET",
        headers: { "x-user-id": userId },
      }
    );
    const vttRes = await subtitlesRoute(vttReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(vttRes.status).toBe(200);
    const vttText = await vttRes.text();
    expect(vttText.startsWith("WEBVTT")).toBe(true);

    // 4. Regression invariant: Change voice of Speaker 1 ONLY -> Speaker 1 segments get version = 2, Speaker 2 segments remain version = 1
    const speakers = await prisma.speaker.findMany({
      where: { jobId: job.id },
      orderBy: { externalSpeakerId: "asc" },
    });
    expect(speakers.length).toBeGreaterThanOrEqual(2);
    const speaker1 = speakers[0];
    const speaker2 = speakers[1];

    const patchVoiceReq = new NextRequest(
      `http://localhost:3000/api/speakers/${speaker1.id}/voice`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ voiceId: "voice_vi_ha_adult_f" }),
      }
    );
    const patchVoiceRes = await patchSpeakerVoiceRoute(patchVoiceReq, {
      params: Promise.resolve({ id: speaker1.id }),
    });
    expect(patchVoiceRes.status).toBe(200);

    const updatedSegments = await prisma.audioSegment.findMany({
      where: { jobId: job.id },
      orderBy: { startMs: "asc" },
    });

    const speaker1Segs = updatedSegments.filter(
      (s) => s.speakerId === speaker1.id
    );
    const speaker2Segs = updatedSegments.filter(
      (s) => s.speakerId === speaker2.id
    );

    expect(speaker1Segs.length).toBeGreaterThan(0);
    expect(speaker2Segs.length).toBeGreaterThan(0);

    // Speaker 1 segments were re-synthesized (version = 2 and new voiceId)
    expect(
      speaker1Segs.every(
        (s) => s.version === 2 && s.voiceId === "voice_vi_ha_adult_f"
      )
    ).toBe(true);
    // Speaker 2 segments were NOT re-rendered (version remains 1!)
    expect(speaker2Segs.every((s) => s.version === 1)).toBe(true);
  });

  it("handles a failed audio segment during playback without crashing and activates safe original-audio fallback", async () => {
    const job = await orchestrator.createJob({
      userId,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=9bZkp7q19f0",
      targetLanguage: "vi",
      clientType: "web",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 2,
    });
    await translationService.translateJob(job.id, { userId });
    await castingService.runAiCastingForJob(job.id, userId);

    const renderReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/render`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({}),
      }
    );
    await renderRoute(renderReq, { params: Promise.resolve({ id: job.id }) });

    const allSegs = await prisma.audioSegment.findMany({
      where: { jobId: job.id },
      orderBy: { startMs: "asc" },
    });
    const firstSeg = allSegs[0];

    // Simulate a TTS segment failure on the first segment
    await prisma.audioSegment.update({
      where: { id: firstSeg.id },
      data: { status: "failed" },
    });

    const playbackReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/playback`,
      {
        method: "GET",
        headers: { "x-user-id": userId },
      }
    );
    const playbackRes = await playbackRoute(playbackReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(playbackRes.status).toBe(200);
    const manifest = await playbackRes.json();

    const syncState = audioSegmentScheduler.resolvePlaybackStateAtTime({
      currentTimeMs: firstSeg.startMs + 200,
      playbackSpeed: 1.0,
      originalVolume: 0.25,
      dubVolume: 1.0,
      dubEnabled: true,
      originalAudioEnabled: true,
      subtitleMode: "bilingual",
      segments: manifest.audioSegments,
    });

    expect(syncState.fallbackActive).toBe(true);
    expect(syncState.effectiveDubVolume).toBe(0);
    expect(syncState.effectiveOriginalVolume).toBeGreaterThanOrEqual(0.8);
  });
});
