import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { ValidationDomainError } from "@/domain/errors";
import { GET as getTranscriptRoute } from "@/app/api/dub-jobs/[id]/transcript/route";
import { PATCH as patchSegmentRoute } from "@/app/api/transcripts/[id]/segments/[segmentId]/route";

describe("MINI-SPEC D2 — Integration & Regression Tests", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `Dialogue Interview (${videoId})`,
    durationSeconds: 36, // 6 segments of ~6s
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
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

  it("runs ASR + diarization after ingest, marks low confidence segments as needsReview, and exposes GET /api/dub-jobs/:id/transcript", async () => {
    const user = await prisma.user.create({
      data: {
        email: "d2-tester@aidub.vn",
        name: "D2 Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    await jobQueueService.processTranscriptionJob(job.id);

    const getReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/transcript`,
      {
        headers: { "x-user-id": user.id },
      }
    );
    const getRes = await getTranscriptRoute(getReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(getRes.status).toBe(200);
    const payload = await getRes.json();

    expect(payload.jobStatus).toBe("translating");
    expect(payload.transcript.status).toBe("ready");
    expect(payload.transcript.source).toBe("asr");
    expect(payload.speakers.length).toBeGreaterThanOrEqual(2);
    expect(payload.speakers[0].displayName).toBe("Speaker 1");
    expect(payload.speakers[1].displayName).toBe("Speaker 2");
    expect(payload.segments.length).toBeGreaterThanOrEqual(4);

    // Regression: Verify low-confidence segment (< 0.75) is marked needsReview = true
    const lowConfSegments = payload.segments.filter(
      (s: { confidence: number; needsReview: boolean }) => s.confidence < 0.75
    );
    expect(lowConfSegments.length).toBeGreaterThanOrEqual(1);
    expect(
      lowConfSegments.every((s: { needsReview: boolean }) => s.needsReview === true)
    ).toBe(true);
  });

  it("Regression: editing a segment via PATCH updates text & speaker, writes audit revision, and preserves original transcript untouched", async () => {
    const user = await prisma.user.create({
      data: {
        email: "editor@aidub.vn",
        name: "Transcript Editor",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    const initialData = await transcriptVersionService.generateTranscriptForJob(
      job.id
    );

    const targetSeg = initialData.segments[0];
    const originalText = targetSeg.sourceText;
    const originalSpeakerId = targetSeg.speakerId;
    const alternateSpeaker = initialData.speakers.find(
      (s) => s.id !== originalSpeakerId
    )!;

    const patchReq = new NextRequest(
      `http://localhost:3000/api/transcripts/${initialData.transcript!.id}/segments/${targetSeg.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          sourceText: "Edited sentence verified by human operator.",
          speakerId: alternateSpeaker.id,
        }),
      }
    );

    const patchRes = await patchSegmentRoute(patchReq, {
      params: Promise.resolve({
        id: initialData.transcript!.id,
        segmentId: targetSeg.id,
      }),
    });
    expect(patchRes.status).toBe(200);
    const updatedSeg = await patchRes.json();

    expect(updatedSeg.sourceText).toBe(
      "Edited sentence verified by human operator."
    );
    expect(updatedSeg.speakerId).toBe(alternateSpeaker.id);
    expect(updatedSeg.version).toBe(2);

    // Regression: Original text and speaker ID MUST remain intact
    expect(updatedSeg.originalSourceText).toBe(originalText);
    expect(updatedSeg.originalSpeakerId).toBe(originalSpeakerId);

    // Audit trail revision must exist in DB
    const revisions = await prisma.transcriptSegmentRevision.findMany({
      where: { segmentId: targetSeg.id },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].previousText).toBe(originalText);
    expect(revisions[0].newText).toBe(
      "Edited sentence verified by human operator."
    );
    expect(revisions[0].previousSpeakerId).toBe(originalSpeakerId);
    expect(revisions[0].newSpeakerId).toBe(alternateSpeaker.id);
  });

  it("Regression: blocks saving an empty segment text so no ready segment ever has empty text", async () => {
    const user = await prisma.user.create({
      data: {
        email: "guard@aidub.vn",
        name: "Guard Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    const data = await transcriptVersionService.generateTranscriptForJob(job.id);
    const firstSeg = data.segments[0];

    await expect(
      transcriptVersionService.updateSegment({
        transcriptId: data.transcript!.id,
        segmentId: firstSeg.id,
        userId: user.id,
        sourceText: "    ",
      })
    ).rejects.toThrowError(ValidationDomainError);
  });
});
