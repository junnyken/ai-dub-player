import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { POST as postTranslateRoute } from "@/app/api/dub-jobs/[id]/translate/route";
import { GET as getTranslationRoute } from "@/app/api/dub-jobs/[id]/translation/route";
import { PATCH as patchTranslationSegRoute } from "@/app/api/translations/[id]/segments/[segmentId]/route";

describe("MINI-SPEC D3 — Integration & Regression Tests", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `Context Translation Video (${videoId})`,
    durationSeconds: 36,
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
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

  it("translates transcript with glossary via POST /api/dub-jobs/:id/translate, reads via GET, and edits via PATCH (status='edited')", async () => {
    const user = await prisma.user.create({
      data: {
        email: "d3-tester@aidub.vn",
        name: "D3 Tester",
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
    const transcriptData =
      await transcriptVersionService.generateTranscriptForJob(job.id);

    const postReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/translate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          glossaryEntries: [
            {
              category: "term",
              sourceTerm: "trí tuệ nhân tạo",
              targetTerm: "Trí Tuệ Nhân Tạo (AI)",
            },
          ],
        }),
      }
    );

    const postRes = await postTranslateRoute(postReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(postRes.status).toBe(200);
    const translatedPayload = await postRes.json();

    expect(translatedPayload.jobStatus).toBe("casting");
    expect(translatedPayload.translation.provider).toBe("context-llm-adapter");
    expect(translatedPayload.translation.model).toBe("gemini-context-vi-1.0");
    expect(translatedPayload.translation.promptVersion).toBe(
      "vi-dub-context-v1"
    );

    // Regression: Number of input segments === number of output segments
    expect(translatedPayload.segments).toHaveLength(
      transcriptData.segments.length
    );
    expect(translatedPayload.segments[0].translatedText).toContain(
      "Trí Tuệ Nhân Tạo (AI)"
    );

    // Edit one segment via PATCH /api/translations/:id/segments/:segmentId
    const firstTransSeg = translatedPayload.segments[0];
    const patchReq = new NextRequest(
      `http://localhost:3000/api/translations/${translatedPayload.translation.id}/segments/${firstTransSeg.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          translatedText:
            "Chào mừng quý vị đến với chuyên mục AI và sản xuất nội dung số.",
        }),
      }
    );

    const patchRes = await patchTranslationSegRoute(patchReq, {
      params: Promise.resolve({
        id: translatedPayload.translation.id,
        segmentId: firstTransSeg.id,
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchedSeg = await patchRes.json();

    expect(patchedSeg.status).toBe("edited");
    expect(patchedSeg.editedBy).toBe(user.id);
    expect(patchedSeg.version).toBe(2);
    expect(patchedSeg.translatedText).toBe(
      "Chào mừng quý vị đến với chuyên mục AI và sản xuất nội dung số."
    );
    expect(patchedSeg.originalTranslatedText).toBe(firstTransSeg.translatedText);

    // Read back via GET /api/dub-jobs/:id/translation
    const getReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/translation`,
      {
        headers: { "x-user-id": user.id },
      }
    );
    const getRes = await getTranslationRoute(getReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(getRes.status).toBe(200);
    const readBack = await getRes.json();
    expect(readBack.segments[0].status).toBe("edited");
  });

  it("Regression: marks failed translation segment as status='failed' and never marks it ready", async () => {
    const user = await prisma.user.create({
      data: {
        email: "fail-seg@aidub.vn",
        name: "Fail Seg User",
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
    const transcriptData =
      await transcriptVersionService.generateTranscriptForJob(job.id);

    // Inject failure marker into second segment
    await transcriptVersionService.updateSegment({
      transcriptId: transcriptData.transcript!.id,
      segmentId: transcriptData.segments[1].id,
      userId: user.id,
      sourceText: "__FORCE_TRANSLATION_ERROR__",
    });

    const result = await translationService.translateJob(job.id, {
      userId: user.id,
    });

    expect(result.segments).toHaveLength(transcriptData.segments.length);
    expect(result.segments[0].status).toBe("ready");
    expect(result.segments[1].status).toBe("failed");
    expect(result.segments[1].errorCode).toBe(
      "TRANSLATION_PROVIDER_SEGMENT_ERROR"
    );
  });
});
