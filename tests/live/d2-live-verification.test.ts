import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { createValidMp4Buffer } from "../helpers/media-fixtures";

describe("MINI-SPEC D2 — Live Verification (1-Speaker Video & Multi-Speaker Video)", () => {
  it("verifies live ASR + diarization on 1 single-speaker video and 1 multi-speaker (3 speakers) video", async () => {
    jobQueueService.setAutoRunWorker(false);

    const user = await prisma.user.upsert({
      where: { email: "d2-live@aidub.vn" },
      update: { creditBalance: 100, plan: "pro" },
      create: {
        email: "d2-live@aidub.vn",
        name: "D2 Live Verifier",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 100,
      },
    });

    // 1. Single-speaker video (monologue)
    const monologueMp4 = createValidMp4Buffer({
      durationSeconds: 24,
      includeAudioTrack: true,
    });
    const stagedMono = await dubJobOrchestrator.stageUpload({
      userId: user.id,
      fileName: "monologue_1speaker.mp4",
      mimeType: "video/mp4",
      buffer: monologueMp4,
      rightsConfirmed: true,
    });

    const monoJob = await dubJobOrchestrator.createJob({
      userId: user.id,
      sourceType: "upload",
      sourceFileId: stagedMono.sourceFileId,
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(monoJob.id);
    const monoTranscript =
      await transcriptVersionService.generateTranscriptForJob(monoJob.id, {
        expectedSpeakerCount: 1,
      });

    expect(monoTranscript.transcript?.status).toBe("ready");
    expect(monoTranscript.speakers).toHaveLength(1);
    expect(monoTranscript.speakers[0].displayName).toBe("Speaker 1");
    expect(monoTranscript.segments.length).toBeGreaterThanOrEqual(2);
    expect(
      monoTranscript.segments.every(
        (s) => s.sourceText.trim().length > 0 && s.endMs > s.startMs
      )
    ).toBe(true);

    // 2. Multi-speaker video (3 speakers panel discussion)
    const panelMp4 = createValidMp4Buffer({
      durationSeconds: 42,
      includeAudioTrack: true,
    });
    const stagedPanel = await dubJobOrchestrator.stageUpload({
      userId: user.id,
      fileName: "panel_3speakers.mp4",
      mimeType: "video/mp4",
      buffer: panelMp4,
      rightsConfirmed: true,
    });

    const panelJob = await dubJobOrchestrator.createJob({
      userId: user.id,
      sourceType: "upload",
      sourceFileId: stagedPanel.sourceFileId,
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(panelJob.id);
    const panelTranscript =
      await transcriptVersionService.generateTranscriptForJob(panelJob.id, {
        expectedSpeakerCount: 3,
      });

    expect(panelTranscript.transcript?.status).toBe("ready");
    expect(panelTranscript.speakers).toHaveLength(3);
    expect(panelTranscript.speakers.map((s) => s.displayName)).toEqual([
      "Speaker 1",
      "Speaker 2",
      "Speaker 3",
    ]);
    expect(panelTranscript.segments.length).toBeGreaterThanOrEqual(3);
  });
});
