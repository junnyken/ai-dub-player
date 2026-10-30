import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { billingService } from "@/server/services/billing-service";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { playbackManifestService } from "@/server/services/playback-manifest-service";

describe("D6 Live Verification: Credit Top-Up -> Cancel Refund -> Retry -> Full Ready Dub", () => {
  it("runs live billing top-up, cancels mid-job with automatic credit refund, retries, and completes full dubbing", async () => {
    jobQueueService.setAutoRunWorker(false);

    const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
      title: `D6 Live Retry & Billing Video (${videoId})`,
      durationSeconds: 180, // 3 minutes -> 3 credits
      playabilityStatus: "OK",
      sourceLanguage: "en",
    }));
    const orchestrator = new DubJobOrchestrator(mockYtResolver);

    const email = "d6-live@aidub.vn";
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
        name: "D6 Live User",
        passwordHash: "hashed",
        plan: "free",
        creditBalance: 1, // Only 1 credit initially (insufficient for 3-min video)
      },
    });

    // 1. Purchase 30-credit top-up pack -> balance becomes 31
    const topup = await billingService.executeCheckout({
      userId: user.id,
      kind: "credit_topup",
      creditPackId: "pack_30",
    });
    expect(topup.user.creditBalance).toBe(31);

    // 2. Create 3-minute job (3 credits) & run ingest (balance becomes 28)
    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      targetLanguage: "vi",
    });
    await jobQueueService.processIngestJob(job.id);

    // 3. Cancel job -> refunds 3 credits back to 31
    const canceled = await orchestrator.cancelJob(job.id, user.id);
    expect(canceled.status).toBe("canceled");
    expect(canceled.refundedCredits).toBe(3);
    expect(canceled.creditBalance).toBe(31);

    // 4. Retry job -> completes D1 -> D2 -> D3 -> D4 -> D5 to "ready"
    const retried = await orchestrator.retryJob(job.id, user.id);
    expect(retried.status).toBe("queued");

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 2,
    });
    await translationService.translateJob(job.id, { userId: user.id });
    await castingService.runAiCastingForJob(job.id, user.id);
    const manifest = await playbackManifestService.renderJobAudio(job.id, {
      userId: user.id,
    });

    expect(manifest.status).toBe("ready");
    expect(manifest.audioSegments.length).toBeGreaterThan(0);

    const ledger = await billingService.getUserLedger(user.id);
    expect(ledger.creditBalance).toBe(28); // 31 - 3 = 28
    expect(ledger.entries.length).toBe(4); // +30 topup, -3 ingest1, +3 refund, -3 ingest2
  });
});
