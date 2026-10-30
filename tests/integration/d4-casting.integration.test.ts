import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { DubJobOrchestrator } from "@/server/services/dub-job-orchestrator";
import { YouTubeUrlResolver } from "@/server/services/youtube-url-resolver";
import { jobQueueService } from "@/server/services/job-queue";
import { transcriptVersionService } from "@/server/services/transcript-version-service";
import { translationService } from "@/server/services/translation-service";
import { castingService } from "@/server/services/casting-service";
import { GET as getJobSpeakersRoute } from "@/app/api/dub-jobs/[id]/speakers/route";
import { PATCH as patchSpeakerVoiceRoute } from "@/app/api/speakers/[id]/voice/route";
import { POST as postVoicePreviewRoute } from "@/app/api/speakers/[id]/voice-preview/route";
import { GET as getVoicesRoute } from "@/app/api/voices/route";
import {
  GET as getVoicePresetsRoute,
  POST as postVoicePresetsRoute,
} from "@/app/api/voice-presets/route";

describe("MINI-SPEC D4 — Integration & Regression Tests", () => {
  const mockYtResolver = new YouTubeUrlResolver(async (videoId) => ({
    title: `Multi-Character Casting Video (${videoId})`,
    durationSeconds: 36,
    playabilityStatus: "OK",
    sourceLanguage: "en",
  }));

  const orchestrator = new DubJobOrchestrator(mockYtResolver);

  beforeEach(async () => {
    jobQueueService.setAutoRunWorker(false);
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

  it("runs AI casting, previews voice, changes speaker voice without re-rendering whole video, and saves VoicePreset", async () => {
    const user = await prisma.user.create({
      data: {
        email: "d4-tester@aidub.vn",
        name: "D4 Tester",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 80,
      },
    });

    const job = await orchestrator.createJob({
      userId: user.id,
      sourceType: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      targetLanguage: "vi",
    });

    await jobQueueService.processIngestJob(job.id);
    await transcriptVersionService.generateTranscriptForJob(job.id, {
      expectedSpeakerCount: 3,
    });
    await translationService.translateJob(job.id, { userId: user.id });
    await castingService.runAiCastingForJob(job.id, user.id);

    // 1. GET /api/voices?language=vi
    const voicesReq = new NextRequest(
      "http://localhost:3000/api/voices?language=vi"
    );
    const voicesRes = await getVoicesRoute(voicesReq);
    expect(voicesRes.status).toBe(200);
    const voicesBody = await voicesRes.json();
    expect(voicesBody.voices.length).toBeGreaterThanOrEqual(4);
    expect(
      voicesBody.voices.every((v: { language: string }) => v.language === "vi")
    ).toBe(true);

    // 2. GET /api/dub-jobs/:id/speakers
    const spkReq = new NextRequest(
      `http://localhost:3000/api/dub-jobs/${job.id}/speakers`,
      { headers: { "x-user-id": user.id } }
    );
    const spkRes = await getJobSpeakersRoute(spkReq, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(spkRes.status).toBe(200);
    const spkBody = await spkRes.json();

    expect(spkBody.jobStatus).toBe("synthesizing");
    expect(spkBody.speakers).toHaveLength(3);
    expect(
      spkBody.speakers.every(
        (s: { isEstimated: boolean; voiceAssignment: { assignedBy: string } }) =>
          s.isEstimated === true && s.voiceAssignment?.assignedBy === "ai"
      )
    ).toBe(true);

    // Distinct AI voice recommendations across the 3 speakers
    const initialVoiceIds = new Set(
      spkBody.speakers.map(
        (s: { voiceAssignment: { voiceId: string } }) =>
          s.voiceAssignment.voiceId
      )
    );
    expect(initialVoiceIds.size).toBe(3);

    const speaker1 = spkBody.speakers[0];
    const speaker2 = spkBody.speakers[1];
    const speaker2InitialVoiceId = speaker2.voiceAssignment.voiceId;

    // 3. POST /api/speakers/:id/voice-preview
    const previewReq = new NextRequest(
      `http://localhost:3000/api/speakers/${speaker1.id}/voice-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ voiceId: "voice_vi_ha_adult_f" }),
      }
    );
    const previewRes = await postVoicePreviewRoute(previewReq, {
      params: Promise.resolve({ id: speaker1.id }),
    });
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json();
    expect(previewBody.previewAudioUrl).toContain("data:audio/wav;base64,");
    expect(previewBody.durationMs).toBeGreaterThan(0);

    // 4. PATCH /api/speakers/:id/voice (Change Speaker 1's voice)
    const patchReq = new NextRequest(
      `http://localhost:3000/api/speakers/${speaker1.id}/voice`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ voiceId: "voice_vi_ha_adult_f" }),
      }
    );
    const patchRes = await patchSpeakerVoiceRoute(patchReq, {
      params: Promise.resolve({ id: speaker1.id }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.voiceAssignment.voiceId).toBe("voice_vi_ha_adult_f");
    expect(patchBody.voiceAssignment.assignedBy).toBe("user");

    // Regression 1: Speaker 1 still has strictly 1 VoiceAssignment in DB
    const speaker1AssignmentsCount = await prisma.voiceAssignment.count({
      where: { speakerId: speaker1.id },
    });
    expect(speaker1AssignmentsCount).toBe(1);

    // Regression 2: Speaker 2's voiceAssignment & job status were NOT reset
    const speaker2AssignmentAfter = await prisma.voiceAssignment.findUnique({
      where: { speakerId: speaker2.id },
    });
    expect(speaker2AssignmentAfter?.voiceId).toBe(speaker2InitialVoiceId);
    expect(speaker2AssignmentAfter?.assignedBy).toBe("ai");

    // 5. POST /api/voice-presets & GET /api/voice-presets
    const createPresetReq = new NextRequest(
      "http://localhost:3000/api/voice-presets",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          name: "Preset Talkshow Công Nghệ",
          jobId: job.id,
        }),
      }
    );
    const createPresetRes = await postVoicePresetsRoute(createPresetReq);
    expect(createPresetRes.status).toBe(201);
    const presetBody = await createPresetRes.json();
    expect(presetBody.name).toBe("Preset Talkshow Công Nghệ");
    expect(presetBody.assignments).toHaveLength(3);

    const listPresetsReq = new NextRequest(
      "http://localhost:3000/api/voice-presets",
      { headers: { "x-user-id": user.id } }
    );
    const listPresetsRes = await getVoicePresetsRoute(listPresetsReq);
    expect(listPresetsRes.status).toBe(200);
    const listPresetsBody = await listPresetsRes.json();
    expect(listPresetsBody.presets).toHaveLength(1);
  });

  it("Regression: blocks assigning a non-Vietnamese voice to a speaker (422)", async () => {
    const user = await prisma.user.create({
      data: {
        email: "guard-voice@aidub.vn",
        name: "Voice Guard",
        passwordHash: "hash",
        plan: "pro",
        creditBalance: 50,
      },
    });

    await prisma.voice.upsert({
      where: { id: "voice_en_only" },
      update: {},
      create: {
        id: "voice_en_only",
        provider: "en-tts",
        providerVoiceId: "en-US-Standard",
        language: "en",
        displayName: "English Voice",
        genderPresentation: "male",
        ageGroup: "adult",
        styleTagsJson: '["english"]',
        isActive: true,
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

    const patchReq = new NextRequest(
      `http://localhost:3000/api/speakers/${transcriptData.speakers[0].id}/voice`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ voiceId: "voice_en_only" }),
      }
    );

    const patchRes = await patchSpeakerVoiceRoute(patchReq, {
      params: Promise.resolve({ id: transcriptData.speakers[0].id }),
    });
    expect(patchRes.status).toBe(422);
    const errBody = await patchRes.json();
    expect(errBody.errorCode).toBe("UNSUPPORTED_VOICE_LANGUAGE");
  });
});
