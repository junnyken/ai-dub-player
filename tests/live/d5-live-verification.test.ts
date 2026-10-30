import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { subtitleService } from "@/server/services/subtitle-service";

describe("D5 Live Verification: Full D1 -> D2 -> D3 -> D4 -> D5 on a 5-minute multi-speaker video", () => {
  it("completes end-to-end dubbing on a 300-second (5-minute) video with 3 speakers, generating aligned TTS segments and VTT subtitles", async () => {
    jobQueueService.setAutoRunWorker(false);

    const mock5MinResolver = new YouTubeUrlResolver(async (videoId) => ({
      title: `Panel Discussion: Future of Studio AI Dubbing 5m (${videoId})`,
      durationSeconds: 300, // 5 minutes
      playabilityStatus: "OK",
      sourceLanguage: "en",
    }));
    const orchestrator = new DubJobOrchestrator(mock5MinResolver);

    const email = "d5-live-5min@aidub.vn";
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
        name: "Live 5-Min Tester",
        passwordHash: "hashed",
        plan: "pro",
        creditBalance: 100,
      },
    });

    // D1: Create DubJob for 5-minute (300s) video (300s = 5 credits)
    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      targetLanguage: "vi",
      clientType: "web",
    });
    expect(job.creditEstimated).toBe(5);

    await jobQueueService.processIngestJob(job.id);

    // D2: ASR + Diarization (3 speakers)
    const d2View = await transcriptVersionService.generateTranscriptForJob(
      job.id,
      { expectedSpeakerCount: 3 }
    );
    expect(d2View.speakers.length).toBe(3);

    // D3: Context Translation
    const d3View = await translationService.translateJob(job.id, {
      userId: user.id,
      glossaryEntries: [
        { sourceTerm: "AI Dub Player", targetTerm: "AI Dub Player" },
      ],
    });
    expect(d3View.segments.length).toBe(d2View.segments.length);

    // D4: AI Character Voice Casting
    const d4View = await castingService.runAiCastingForJob(job.id, user.id);
    expect(
      d4View.speakers.every((s) => Boolean(s.voiceAssignment?.voiceId))
    ).toBe(true);

    // D5: TTS Synthesis + Timing Alignment + Subtitles + Playback Manifest
    const manifest = await playbackManifestService.renderJobAudio(job.id, {
      userId: user.id,
    });

    expect(manifest.status).toBe("ready");
    expect(manifest.durationSeconds).toBe(300);
    expect(manifest.audioSegments.length).toBe(d3View.segments.length);
    expect(
      manifest.audioSegments.every(
        (seg) =>
          seg.status === "ready" &&
          seg.audioUrl.startsWith("data:audio/wav;base64,") &&
          Boolean(seg.timingStrategy)
      )
    ).toBe(true);

    // Verify WEBVTT subtitle tracks (source, target, bilingual)
    const viVtt = await subtitleService.getJobSubtitleVtt({
      jobId: job.id,
      userId: user.id,
      kind: "target",
    });
    const biVtt = await subtitleService.getJobSubtitleVtt({
      jobId: job.id,
      userId: user.id,
      kind: "bilingual",
    });

    expect(viVtt).toContain("WEBVTT");
    expect(biVtt).toContain("WEBVTT");
  });
});
