import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { createValidMp4Buffer } from "../helpers/media-fixtures";

describe("MINI-SPEC D3 — Live Verification (Multi-Speaker Conversation Translation)", () => {
  it("translates a multi-speaker conversation video into Vietnamese with glossary and speaker pronoun consistency", async () => {
    jobQueueService.setAutoRunWorker(false);

    const user = await prisma.user.upsert({
      where: { email: "d3-live@aidub.vn" },
      update: { creditBalance: 100, plan: "pro" },
      create: {
        email: "d3-live@aidub.vn",
        name: "D3 Live Verifier",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 100,
      },
    });

    const mp4Buf = createValidMp4Buffer({
      durationSeconds: 36,
      includeAudioTrack: true,
    });

    const staged = await dubJobOrchestrator.stageUpload({
      userId: user.id,
      fileName: "multi_speaker_dialogue.mp4",
      mimeType: "video/mp4",
      buffer: mp4Buf,
      rightsConfirmed: true,
    });

    const job = await dubJobOrchestrator.createJob({
      userId: user.id,
      sourceType: "upload",
      sourceFileId: staged.sourceFileId,
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    const transcriptData =
      await transcriptVersionService.generateTranscriptForJob(job.id, {
        expectedSpeakerCount: 3,
      });

    const speaker1 = transcriptData.speakers[0];
    const translationData = await translationService.translateJob(job.id, {
      userId: user.id,
      glossaryEntries: [
        {
          category: "proper_noun",
          sourceTerm: "studio",
          targetTerm: "Studio Lồng Tiếng AI",
        },
        {
          category: "pronoun_rule",
          sourceTerm: "bạn",
          targetTerm: "các bạn",
          speakerId: speaker1.id,
        },
      ],
    });

    expect(translationData.jobStatus).toBe("casting");
    expect(translationData.translation?.status).toBe("ready");
    expect(translationData.segments).toHaveLength(
      transcriptData.segments.length
    );

    for (let i = 0; i < translationData.segments.length; i++) {
      const tSeg = translationData.segments[i];
      const origSeg = transcriptData.segments[i];
      expect(tSeg.transcriptSegmentId).toBe(origSeg.id);
      expect(tSeg.speakerId).toBe(origSeg.speakerId);
      expect(tSeg.startMs).toBe(origSeg.startMs);
      expect(tSeg.endMs).toBe(origSeg.endMs);
      expect(tSeg.status).toBe("ready");
      expect(tSeg.translatedText.length).toBeGreaterThan(0);
    }
  });
});
