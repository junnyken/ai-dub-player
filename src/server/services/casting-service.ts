import { prisma } from "@/server/db/prisma";
import {
  ApparentGender,
  ClientType,
  DubJobStatus,
  EstimatedAgeGroup,
  SourceType,
  SpeakerRoleHint,
  VoiceAssignedBy,
} from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import { voiceCatalogService } from "@/server/services/voice-catalog-service";
import { speakerAnalyzer } from "@/server/services/speaker-analyzer";
import { voiceMatcher } from "@/server/services/voice-matcher";
import { playbackManifestService } from "@/server/services/playback-manifest-service";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { recordJobObservabilityEvent } from "@/server/observability/logger";

export class CastingService {
  public async runAiCastingForJob(jobId: string, userId?: string) {
    const startedAt = Date.now();
    await voiceCatalogService.ensureDefaultVoicesSeeded();

    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: {
        speakers: {
          orderBy: { externalSpeakerId: "asc" },
          include: {
            segments: {
              orderBy: { segmentIndex: "asc" },
            },
          },
        },
        transcript: {
          include: {
            segments: true,
          },
        },
      },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để phân vai giọng nói."
      );
    }

    if (userId && job.userId !== userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền truy cập tiến trình này."
      );
    }

    if (job.speakers.length === 0) {
      throw new ValidationDomainError(
        "NO_SPEAKERS_FOR_CASTING",
        "Chưa có thông tin người nói để thực hiện AI Casting."
      );
    }

    const castingMsg =
      "Đang phân tích hồ sơ nhân vật và đề xuất giọng nói phù hợp (AI Casting)";
    await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: "casting",
        progress: 68,
        currentStageMessage: castingMsg,
      },
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: "casting",
      progress: 68,
      message: castingMsg,
      readyFromMs: 0,
      readyToMs: 0,
    });

    const totalJobSegmentsCount = job.transcript?.segments.length ?? 0;

    const analyzedProfiles = job.speakers.map((spk) =>
      speakerAnalyzer.analyzeSpeaker({
        speakerId: spk.id,
        externalSpeakerId: spk.externalSpeakerId,
        displayName: spk.displayName,
        currentAgeGroup: spk.estimatedAgeGroup,
        currentApparentGender: spk.apparentGender,
        currentRoleHint: spk.roleHint,
        currentEmotionProfile: spk.emotionProfile
          ? JSON.parse(spk.emotionProfile)
          : undefined,
        segments: spk.segments.map((s) => ({
          startMs: s.startMs,
          endMs: s.endMs,
          sourceText: s.sourceText,
          confidence: s.confidence,
        })),
        totalJobSegmentsCount,
      })
    );

    const availableVoices = await voiceCatalogService.listVoices({
      language: "vi",
    });

    const matchedRecommendations = voiceMatcher.matchVoicesForSpeakers({
      profiles: analyzedProfiles,
      availableVoices,
    });

    const nextStatus: DubJobStatus = "synthesizing";
    const doneMessage =
      "Đã chọn giọng đọc theo nhân vật. Sẵn sàng tổng hợp giọng nói (TTS)";

    await prisma.$transaction(async (tx) => {
      for (const profile of analyzedProfiles) {
        await tx.speaker.update({
          where: { id: profile.speakerId },
          data: {
            estimatedAgeGroup: profile.estimatedAgeGroup,
            apparentGender: profile.apparentGender,
            roleHint: profile.roleHint,
            emotionProfile: JSON.stringify(profile.emotionProfile),
            appearanceCount: profile.appearanceCount,
            isEstimated: true,
          },
        });
      }

      for (const rec of matchedRecommendations) {
        // Constraint 3: Strictly one active voice assignment per speaker in a job
        await tx.voiceAssignment.upsert({
          where: { speakerId: rec.speakerId },
          update: {
            voiceId: rec.voiceId,
            assignedBy: "ai",
            matchScore: rec.matchScore,
            matchReason: rec.matchReason,
          },
          create: {
            jobId: job.id,
            speakerId: rec.speakerId,
            voiceId: rec.voiceId,
            assignedBy: "ai",
            matchScore: rec.matchScore,
            matchReason: rec.matchReason,
          },
        });
      }

      await tx.dubJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          progress: 75,
          currentStageMessage: doneMessage,
        },
      });
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: nextStatus,
      progress: 75,
      message: doneMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: "ai-voice-caster",
      stage: "casting_ready",
      durationMs: Date.now() - startedAt,
      status: nextStatus,
      creditSpent: job.creditSpent,
      message: doneMessage,
    });

    return this.getJobSpeakersWithVoices(job.id, job.userId);
  }

  public async getJobSpeakersWithVoices(jobId: string, userId: string) {
    await voiceCatalogService.ensureDefaultVoicesSeeded();

    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng này."
      );
    }

    if (job.userId !== userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền xem danh sách nhân vật của tài khoản khác."
      );
    }

    const speakers = await prisma.speaker.findMany({
      where: { jobId },
      orderBy: { externalSpeakerId: "asc" },
      include: {
        voiceAssignment: {
          include: {
            voice: true,
          },
        },
      },
    });

    return {
      jobId: job.id,
      jobStatus: job.status,
      speakers: speakers.map((spk) => {
        const gender = (spk.apparentGender ?? "unknown") as ApparentGender;
        const age = (spk.estimatedAgeGroup ?? "adult") as EstimatedAgeGroup;
        const role = (spk.roleHint ?? "main_character") as SpeakerRoleHint;

        return {
          id: spk.id,
          jobId: spk.jobId,
          externalSpeakerId: spk.externalSpeakerId,
          displayName: spk.displayName,
          estimatedAgeGroup: age,
          apparentGender: gender,
          roleHint: role,
          emotionProfile: spk.emotionProfile
            ? JSON.parse(spk.emotionProfile)
            : [],
          appearanceCount: spk.appearanceCount,
          isEstimated: true,
          estimatedLabelVi: speakerAnalyzer.buildVietnameseLabel(
            gender,
            age,
            role
          ),
          voiceAssignment: spk.voiceAssignment
            ? {
                id: spk.voiceAssignment.id,
                voiceId: spk.voiceAssignment.voiceId,
                assignedBy: spk.voiceAssignment.assignedBy as VoiceAssignedBy,
                matchScore: spk.voiceAssignment.matchScore,
                matchReason: spk.voiceAssignment.matchReason,
                updatedAt: spk.voiceAssignment.updatedAt,
                voice: {
                  id: spk.voiceAssignment.voice.id,
                  provider: spk.voiceAssignment.voice.provider,
                  providerVoiceId: spk.voiceAssignment.voice.providerVoiceId,
                  language: spk.voiceAssignment.voice.language,
                  displayName: spk.voiceAssignment.voice.displayName,
                  genderPresentation:
                    spk.voiceAssignment.voice.genderPresentation,
                  ageGroup: spk.voiceAssignment.voice.ageGroup,
                  styleTags: JSON.parse(
                    spk.voiceAssignment.voice.styleTagsJson || "[]"
                  ),
                  previewUrl: spk.voiceAssignment.voice.previewUrl,
                },
              }
            : null,
        };
      }),
    };
  }

  public async assignSpeakerVoice(params: {
    speakerId: string;
    voiceId: string;
    userId: string;
  }) {
    await voiceCatalogService.ensureDefaultVoicesSeeded();

    const speaker = await prisma.speaker.findUnique({
      where: { id: params.speakerId },
      include: { job: true },
    });

    if (!speaker) {
      throw new DomainError(
        404,
        "SPEAKER_NOT_FOUND",
        "Không tìm thấy nhân vật/người nói cần đổi giọng."
      );
    }

    if (speaker.job.userId !== params.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_SPEAKER_EDIT",
        "Bạn không có quyền đổi giọng cho tiến trình này."
      );
    }

    const voice = await prisma.voice.findUnique({
      where: { id: params.voiceId },
    });

    if (!voice || !voice.isActive) {
      throw new ValidationDomainError(
        "VOICE_NOT_FOUND_OR_INACTIVE",
        "Giọng đọc được chọn không tồn tại hoặc đã ngừng hỗ trợ."
      );
    }

    if (voice.language !== "vi") {
      throw new ValidationDomainError(
        "UNSUPPORTED_VOICE_LANGUAGE",
        "Chỉ cho phép chọn giọng đọc hỗ trợ Tiếng Việt (language='vi')."
      );
    }

    // Constraint 3 & Regression Rule:
    // Upsert the single VoiceAssignment for this speaker ONLY.
    // Do NOT reset or re-render the entire video or touch other speakers!
    const assignment = await prisma.voiceAssignment.upsert({
      where: { speakerId: speaker.id },
      update: {
        voiceId: voice.id,
        assignedBy: "user",
        matchScore: 1.0,
        matchReason: "Người dùng chủ động chọn giọng",
      },
      create: {
        jobId: speaker.jobId,
        speakerId: speaker.id,
        voiceId: voice.id,
        assignedBy: "user",
        matchScore: 1.0,
        matchReason: "Người dùng chủ động chọn giọng",
      },
      include: {
        voice: true,
      },
    });

    // If audio segments were already rendered, re-synthesize ONLY this speaker's segments
    await playbackManifestService.resynthesizeSpeakerSegmentsIfRendered(
      speaker.jobId,
      speaker.id
    );

    return {
      speakerId: speaker.id,
      jobId: speaker.jobId,
      displayName: speaker.displayName,
      isEstimated: speaker.isEstimated,
      voiceAssignment: {
        id: assignment.id,
        voiceId: assignment.voiceId,
        assignedBy: assignment.assignedBy as VoiceAssignedBy,
        matchScore: assignment.matchScore,
        matchReason: assignment.matchReason,
        updatedAt: assignment.updatedAt,
        voice: {
          id: assignment.voice.id,
          displayName: assignment.voice.displayName,
          language: assignment.voice.language,
          genderPresentation: assignment.voice.genderPresentation,
          ageGroup: assignment.voice.ageGroup,
          styleTags: JSON.parse(assignment.voice.styleTagsJson || "[]"),
          previewUrl: assignment.voice.previewUrl,
        },
      },
    };
  }
}

export const castingService = new CastingService();
