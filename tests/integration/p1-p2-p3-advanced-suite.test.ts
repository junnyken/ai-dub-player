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
import { liveAiBridge } from "@/server/providers/live-ai-bridge";
import { universalVideoDetector } from "@/extension/universal-video-detector";
import { GET as exportJobRoute } from "@/app/api/dub-jobs/[id]/export/route";
import { POST as cloneVoiceRoute } from "@/app/api/speakers/[id]/clone-voice/route";
import {
  GET as getQualityReportRoute,
  POST as postAutoOptimizeRoute,
} from "@/app/api/dub-jobs/[id]/quality-report/route";
import { GET as getSubtitlesRoute } from "@/app/api/dub-jobs/[id]/subtitles/route";
import { prosodyEmotionEngine } from "@/server/services/prosody-emotion-engine";

describe("PACKAGES P1, P2, P3 — Live Caption Bridge, MP4/BGM Export, Zero-Shot Voice Cloning & Universal Video Detector", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `Anime Episode 1 - Animation (${videoId})`,
    durationSeconds: 18,
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);

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
  });

  it("P1: parses real YouTube TimedText XML captions into accurate millisecond utterances and reports AI bridge status", () => {
    const sampleXml = `<?xml version="1.0" encoding="utf-8" ?>
      <transcript>
        <text start="0.5" dur="3.2">Look over there! That little dragon is flying!</text>
        <text start="4.1" dur="2.8">Hold on tight everyone &amp; never give up!</text>
      </transcript>`;

    const utterances = liveAiBridge.parseYouTubeTimedTextXml(sampleXml);
    expect(utterances).toHaveLength(2);
    expect(utterances[0]).toMatchObject({
      startMs: 500,
      endMs: 3700,
      text: "Look over there! That little dragon is flying!",
    });
    expect(utterances[1]).toMatchObject({
      startMs: 4100,
      endMs: 6900,
      text: "Hold on tight everyone & never give up!",
    });

    const status = liveAiBridge.getEnvironmentStatus();
    expect(status.activeTranslationBackend).toBeDefined();
  });

  it("P2: clones speaker voice (Zero-Shot F5-TTS-Vi) via POST /api/speakers/:id/clone-voice and exports muxed .MP4 + Demucs BGM .WAV via GET /api/dub-jobs/:id/export", async () => {
    const user = await prisma.user.create({
      data: {
        email: "p2-exporter@aidub.vn",
        name: "P2 Studio Creator",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 200,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=animDragon1",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id);
    await translationService.translateJob(job.id, { userId: user.id });
    const casting = await castingService.runAiCastingForJob(job.id, user.id);
    await playbackManifestService.renderJobAudio(job.id, { userId: user.id });

    const targetSpeaker = casting.speakers[0];

    // 1. Test Zero-Shot Voice Cloning via POST /api/speakers/[id]/clone-voice
    const cloneReq = new NextRequest(
      `http://localhost:3000/api/speakers/${targetSpeaker.id}/clone-voice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          customVoiceName: "Nhân vật Rồng Nhỏ (Giọng Clone Gốc)",
        }),
      }
    );
    const cloneRes = await cloneVoiceRoute(cloneReq, {
      params: Promise.resolve({ id: targetSpeaker.id }),
    });
    expect(cloneRes.status).toBe(200);
    const cloneData = await cloneRes.json();
    expect(cloneData.clonedVoice.provider).toBe("f5-tts-vi-clone");
    expect(cloneData.clonedVoice.displayName).toBe(
      "Nhân vật Rồng Nhỏ (Giọng Clone Gốc)"
    );

    // 2. Test Master Muxed MP4 Export with Demucs BGM Stem Separation
    const mp4Req = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/export?format=mp4&stem=bgm_isolated&responseType=json`,
      {
        headers: { "x-user-id": user.id },
      }
    );
    const mp4Res = await exportJobRoute(mp4Req, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(mp4Res.status).toBe(200);
    const mp4Json = await mp4Res.json();
    expect(mp4Json.format).toBe("mp4");
    expect(mp4Json.mimeType).toBe("video/mp4");
    expect(mp4Json.stemSeparationModel).toBe("facebook/htdemucs");
    expect(mp4Json.isolateBgmStem).toBe(true);
    expect(mp4Json.sizeBytes).toBeGreaterThan(2000);
    expect(mp4Json.dataUri.startsWith("data:video/mp4;base64,")).toBe(true);

    // 3. Test Binary MP4 Download Response
    const binReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/export?format=mp4`,
      {
        headers: { "x-user-id": user.id },
      }
    );
    const binRes = await exportJobRoute(binReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(binRes.status).toBe(200);
    expect(binRes.headers.get("Content-Type")).toBe("video/mp4");
    const binBuf = Buffer.from(await binRes.arrayBuffer());
    expect(binBuf.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("P3: UniversalVideoDetector detects YouTube, Bilibili Anime, Vimeo, Dailymotion, and generic HTML5 video websites", () => {
    const yt = universalVideoDetector.detectFromUrl({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(yt?.platform).toBe("youtube");
    expect(yt?.videoId).toBe("dQw4w9WgXcQ");

    const bili = universalVideoDetector.detectFromUrl({
      url: "https://www.bilibili.tv/en/play/1048921",
      pageTitle: "Anime Episode 12",
    });
    expect(bili?.platform).toBe("bilibili");
    expect(bili?.videoId).toMatch(/^[a-zA-Z0-9_-]{11}$/);

    const vimeo = universalVideoDetector.detectFromUrl({
      url: "https://vimeo.com/76979871",
    });
    expect(vimeo?.platform).toBe("vimeo");
    expect(vimeo?.videoId).toMatch(/^[a-zA-Z0-9_-]{11}$/);

    const genericAnimeSite = universalVideoDetector.detectFromUrl({
      url: "https://anime-cinema-stream.example.com/watch/ep-05",
      hasHtml5VideoElement: true,
    });
    expect(genericAnimeSite?.platform).toBe("html5_generic");
    expect(genericAnimeSite?.videoId).toMatch(/^[a-zA-Z0-9_-]{11}$/);
  });

  it("S1, S2 & S3: evaluates Prosody Emotion contours, generates Studio QC Scorecard & Auto-Optimize via /api/dub-jobs/:id/quality-report, and exports .ASS/.SRT subtitles", async () => {
    // 1. S1 Prosody Emotion Contour verification
    const excitedProsody = prosodyEmotionEngine.analyzeSentenceProsody({
      text: "Nhìn đằng kia kìa cậu ơi! Tuyệt quá!",
      slotDurationMs: 3500,
    });
    expect(excitedProsody.emotion).toBe("excited");
    expect(excitedProsody.lipSyncScore).toBeGreaterThanOrEqual(0.95);

    const questionProsody = prosodyEmotionEngine.analyzeSentenceProsody({
      text: "Vì sao việc tách người nói lại quan trọng thế?",
      slotDurationMs: 4000,
    });
    expect(questionProsody.emotion).toBe("questioning");

    // 2. S2 & S3 Studio QC Report, Auto-Optimize Cadence & .ASS / .SRT subtitle export
    const user = await prisma.user.create({
      data: {
        email: "studio-pro@aidub.vn",
        name: "Studio Pro Director",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 300,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=animDragon1",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id);
    await translationService.translateJob(job.id, { userId: user.id });
    await castingService.runAiCastingForJob(job.id, user.id);
    await playbackManifestService.renderJobAudio(job.id, { userId: user.id });

    const qcGetReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/quality-report`,
      { headers: { "x-user-id": user.id } }
    );
    const qcGetRes = await getQualityReportRoute(qcGetReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(qcGetRes.status).toBe(200);
    const qcReport = await qcGetRes.json();
    expect(qcReport.detectedGenreId).toBe("animation");
    expect(qcReport.overallScore).toBeGreaterThanOrEqual(90);
    expect(qcReport.metrics.lipSyncScore).toBeGreaterThanOrEqual(90);

    // Trigger Auto-Optimize Cadence
    const qcPostReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/quality-report`,
      { method: "POST", headers: { "x-user-id": user.id } }
    );
    const qcPostRes = await postAutoOptimizeRoute(qcPostReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(qcPostRes.status).toBe(200);
    const optimizedReport = await qcPostRes.json();
    expect(optimizedReport.onBeatSegmentsCount).toBe(
      optimizedReport.totalSegments
    );

    // Export .ASS Character-Colored Subtitles & .SRT Subtitles
    const assReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/subtitles?kind=bilingual&format=ass`,
      { headers: { "x-user-id": user.id } }
    );
    const assRes = await getSubtitlesRoute(assReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(assRes.status).toBe(200);
    const assText = await assRes.text();
    expect(assText).toContain("[V4+ Styles]");
    expect(assText).toContain("Style: Speaker1");
    expect(assText).toContain("Dialogue: 0,");

    const srtReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/subtitles?kind=target&format=srt`,
      { headers: { "x-user-id": user.id } }
    );
    const srtRes = await getSubtitlesRoute(srtReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(srtRes.status).toBe(200);
    const srtText = await srtRes.text();
    expect(srtText).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
  });
});
