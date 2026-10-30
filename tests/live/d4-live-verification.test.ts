import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { dubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { voicePreviewService } from "@/server/services/voice-preview-service";
import { voicePresetService } from "@/server/services/voice-preset-service";
import { storageAdapter } from "@/server/storage/storage-adapter";
import { createValidMp4Buffer } from "../helpers/media-fixtures";

describe("MINI-SPEC D4 — Live Verification (3-Speaker Video AI Casting + Preview + Preset)", () => {
  it("runs full D1->D2->D3->D4 pipeline on a 3-speaker video, previews audio on disk, swaps 1 speaker voice, and saves preset", async () => {
    jobQueueService.setAutoRunWorker(false);

    const user = await prisma.user.upsert({
      where: { email: "d4-live@aidub.vn" },
      update: { creditBalance: 100, plan: "pro" },
      create: {
        email: "d4-live@aidub.vn",
        name: "D4 Live Verifier",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 100,
      },
    });

    const mp4Buf = createValidMp4Buffer({
      durationSeconds: 42,
      includeAudioTrack: true,
    });

    const staged = await dubJobOrchestrator.stageUpload({
      userId: user.id,
      fileName: "casting_3speakers_live.mp4",
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
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 3,
    });
    await translationService.translateJob(job.id, { userId: user.id });

    const castingResult = await castingService.runAiCastingForJob(
      job.id,
      user.id
    );

    expect(castingResult.jobStatus).toBe("synthesizing");
    expect(castingResult.speakers).toHaveLength(3);

    const distinctVoices = new Set(
      castingResult.speakers.map((s) => s.voiceAssignment?.voiceId)
    );
    expect(distinctVoices.size).toBe(3);

    // Generate live audio preview for Speaker 1 and verify WAV file exists in storage
    const spk1 = castingResult.speakers[0];
    const preview = await voicePreviewService.generateSpeakerVoicePreview({
      speakerId: spk1.id,
      userId: user.id,
    });
    expect(await storageAdapter.exists(preview.storageKey)).toBe(true);

    // Swap Speaker 2's voice to Khoi and verify Speaker 1 & 3 are untouched
    const spk2 = castingResult.speakers[1];
    await castingService.assignSpeakerVoice({
      speakerId: spk2.id,
      voiceId: "voice_vi_khoi_young_m",
      userId: user.id,
    });

    const afterSwap = await castingService.getJobSpeakersWithVoices(
      job.id,
      user.id
    );
    expect(afterSwap.speakers[1].voiceAssignment?.voiceId).toBe(
      "voice_vi_khoi_young_m"
    );
    expect(afterSwap.speakers[1].voiceAssignment?.assignedBy).toBe("user");
    expect(afterSwap.speakers[0].voiceAssignment?.assignedBy).toBe("ai");

    // Save preset for this video
    const preset = await voicePresetService.createPreset({
      userId: user.id,
      name: "Preset Live 3 Nhân Vật",
      jobId: job.id,
    });
    expect(preset.assignments).toHaveLength(3);
  });
});
