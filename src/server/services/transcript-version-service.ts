import { prisma } from "@/server/db/prisma";
import {
  ClientType,
  DubJobStatus,
  SourceType,
  TranscriptSource,
} from "@/domain/models";
import { DomainError, ValidationDomainError } from "@/domain/errors";
import {
  AsrProvider,
  defaultAsrProvider,
  RawAsrUtterance,
} from "@/server/providers/asr-provider";
import {
  defaultDiarizationProvider,
  DiarizationProvider,
} from "@/server/providers/diarization-provider";
import { segmentMerger } from "@/server/services/segment-merger";
import { jobEventsBus } from "@/server/services/job-events-bus";
import { recordJobObservabilityEvent } from "@/server/observability/logger";

export interface GenerateTranscriptOptions {
  userId?: string;
  expectedSpeakerCount?: number;
  forceAudioUnavailable?: boolean;
  captionFallbackUtterances?: RawAsrUtterance[];
}

export interface UpdateTranscriptSegmentInput {
  transcriptId: string;
  segmentId: string;
  userId: string;
  sourceText?: string;
  speakerId?: string;
  needsReview?: boolean;
}

export class TranscriptVersionService {
  private readonly asrProvider: AsrProvider;
  private readonly diarizationProvider: DiarizationProvider;

  constructor(
    asrProvider: AsrProvider = defaultAsrProvider,
    diarizationProvider: DiarizationProvider = defaultDiarizationProvider
  ) {
    this.asrProvider = asrProvider;
    this.diarizationProvider = diarizationProvider;
  }

  public async generateTranscriptForJob(
    jobId: string,
    options?: GenerateTranscriptOptions
  ) {
    const startedAt = Date.now();
    const job = await prisma.dubJob.findUnique({
      where: { id: jobId },
      include: { mediaAssets: true },
    });

    if (!job) {
      throw new DomainError(
        404,
        "JOB_NOT_FOUND",
        "Không tìm thấy tiến trình lồng tiếng để tạo transcript."
      );
    }

    if (options?.userId && job.userId !== options.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_JOB_ACCESS",
        "Bạn không có quyền thao tác trên tiến trình lồng tiếng của người dùng khác."
      );
    }

    const durationMs = (job.durationSeconds ?? 0) * 1000;
    const hasAudioAsset =
      options?.forceAudioUnavailable === true
        ? false
        : job.mediaAssets.some(
            (a) => a.kind === "source_audio" || a.kind === "source_video"
          );

    // Step 1: transcribing
    const transcribingMessage =
      "Đang nhận diện giọng nói và tạo transcript (ASR)";
    await prisma.dubJob.update({
      where: { id: job.id },
      data: {
        status: "transcribing",
        progress: 30,
        currentStageMessage: transcribingMessage,
      },
    });

    jobEventsBus.publish({
      jobId: job.id,
      status: "transcribing",
      progress: 30,
      message: transcribingMessage,
      readyFromMs: 0,
      readyToMs: 0,
    });

    await recordJobObservabilityEvent({
      jobId: job.id,
      userId: job.userId,
      clientType: job.clientType as ClientType,
      sourceType: job.sourceType as SourceType,
      provider: this.asrProvider.providerName,
      stage: "asr_start",
      durationMs: Date.now() - startedAt,
      status: "transcribing",
      creditSpent: job.creditSpent,
      message: transcribingMessage,
    });

    try {
      const asrResult = await this.asrProvider.transcribe({
        jobId: job.id,
        durationMs,
        sourceLanguage: job.sourceLanguage ?? "en",
        title: job.title,
        sourceVideoId: job.sourceVideoId,
        audioAvailable: hasAudioAsset,
        captionFallbackUtterances: options?.captionFallbackUtterances,
      });

      // Step 2: diarizing
      const diarizingMessage =
        "Đang phân tách cụm người nói (Speaker Diarization)";
      await prisma.dubJob.update({
        where: { id: job.id },
        data: {
          status: "diarizing",
          progress: 38,
          currentStageMessage: diarizingMessage,
        },
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: "diarizing",
        progress: 38,
        message: diarizingMessage,
        readyFromMs: 0,
        readyToMs: 0,
      });

      await recordJobObservabilityEvent({
        jobId: job.id,
        userId: job.userId,
        clientType: job.clientType as ClientType,
        sourceType: job.sourceType as SourceType,
        provider: this.diarizationProvider.providerName,
        stage: "diarization_start",
        durationMs: Date.now() - startedAt,
        status: "diarizing",
        creditSpent: job.creditSpent,
        message: diarizingMessage,
      });

      const diarizationResult = await this.diarizationProvider.diarize({
        jobId: job.id,
        durationMs,
        utteranceWindows: asrResult.utterances.map((u) => ({
          startMs: u.startMs,
          endMs: u.endMs,
        })),
        expectedSpeakerCount: options?.expectedSpeakerCount,
        title: job.title,
        sampleTexts: asrResult.utterances.map((u) => u.text),
      });

      const mergedDrafts = segmentMerger.alignAndNormalize({
        utterances: asrResult.utterances,
        turns: diarizationResult.turns,
      });

      // Validate invariant: no ready segment with empty text or invalid timeline
      for (const draft of mergedDrafts) {
        if (!draft.sourceText.trim() || draft.endMs <= draft.startMs) {
          throw new ValidationDomainError(
            "INVALID_MERGED_SEGMENT",
            "Segment sau khi gộp có nội dung rỗng hoặc thời gian không hợp lệ."
          );
        }
      }

      const nextStatus: DubJobStatus = "translating";
      const completedMessage =
        "Đã hoàn tất transcript và nhận diện người nói. Sẵn sàng dịch ngữ cảnh sang tiếng Việt";

      const persisted = await prisma.$transaction(async (tx) => {
        // Clean existing downstream artifacts & transcript/speakers if re-running
        await tx.audioSegment.deleteMany({ where: { jobId: job.id } });
        await tx.translation.deleteMany({ where: { jobId: job.id } });
        await tx.voiceAssignment.deleteMany({ where: { jobId: job.id } });
        await tx.transcript.deleteMany({ where: { jobId: job.id } });
        await tx.speaker.deleteMany({ where: { jobId: job.id } });

        // Count appearances per externalSpeakerId
        const countsByExternalId = new Map<string, number>();
        for (const seg of mergedDrafts) {
          countsByExternalId.set(
            seg.externalSpeakerId,
            (countsByExternalId.get(seg.externalSpeakerId) ?? 0) + 1
          );
        }

        const speakerIdByExternal = new Map<string, string>();
        for (const spk of diarizationResult.speakers) {
          const createdSpk = await tx.speaker.create({
            data: {
              jobId: job.id,
              externalSpeakerId: spk.externalSpeakerId,
              displayName: spk.displayName,
              estimatedAgeGroup: spk.estimatedAgeGroup,
              apparentGender: spk.apparentGender,
              roleHint: spk.roleHint,
              emotionProfile: JSON.stringify(spk.emotionProfile),
              appearanceCount: countsByExternalId.get(spk.externalSpeakerId) ?? 0,
              isEstimated: true,
            },
          });
          speakerIdByExternal.set(spk.externalSpeakerId, createdSpk.id);
        }

        const createdTranscript = await tx.transcript.create({
          data: {
            jobId: job.id,
            language: asrResult.language,
            source: asrResult.source,
            provider: asrResult.providerName,
            status: "ready",
            version: 1,
          },
        });

        for (const draft of mergedDrafts) {
          const resolvedSpeakerId =
            speakerIdByExternal.get(draft.externalSpeakerId) ??
            Array.from(speakerIdByExternal.values())[0];

          await tx.transcriptSegment.create({
            data: {
              transcriptId: createdTranscript.id,
              speakerId: resolvedSpeakerId,
              segmentIndex: draft.segmentIndex,
              startMs: draft.startMs,
              endMs: draft.endMs,
              sourceText: draft.sourceText,
              originalSourceText: draft.sourceText,
              originalSpeakerId: resolvedSpeakerId,
              confidence: draft.confidence,
              needsReview: draft.needsReview,
              version: 1,
            },
          });
        }

        await tx.dubJob.update({
          where: { id: job.id },
          data: {
            status: nextStatus,
            progress: 45,
            currentStageMessage: completedMessage,
          },
        });

        return createdTranscript;
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: nextStatus,
        progress: 45,
        message: completedMessage,
        readyFromMs: 0,
        readyToMs: 0,
      });

      await recordJobObservabilityEvent({
        jobId: job.id,
        userId: job.userId,
        clientType: job.clientType as ClientType,
        sourceType: job.sourceType as SourceType,
        provider: this.asrProvider.providerName,
        stage: "transcript_ready",
        durationMs: Date.now() - startedAt,
        status: nextStatus,
        creditSpent: job.creditSpent,
        message: completedMessage,
      });

      return this.getTranscriptByJobId(job.id, job.userId);
    } catch (err) {
      const errorCode =
        err instanceof DomainError
          ? err.errorCode
          : err instanceof Error
          ? err.message
          : "TRANSCRIPTION_FAILED";
      const failMessage =
        err instanceof Error
          ? err.message
          : "Không thể hoàn tất nhận diện giọng nói.";

      await prisma.dubJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorCode,
          errorMessage: failMessage,
          currentStageMessage: failMessage,
        },
      });

      jobEventsBus.publish({
        jobId: job.id,
        status: "failed",
        progress: 30,
        message: failMessage,
        readyFromMs: 0,
        readyToMs: 0,
        errorCode,
      });

      throw err;
    }
  }

  public async getTranscriptByJobId(jobId: string, userId: string) {
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
        "Bạn không có quyền truy cập transcript của tài khoản khác."
      );
    }

    const transcript = await prisma.transcript.findUnique({
      where: { jobId },
      include: {
        segments: {
          orderBy: { segmentIndex: "asc" },
          include: {
            speaker: true,
            revisions: {
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        },
      },
    });

    const speakers = await prisma.speaker.findMany({
      where: { jobId },
      orderBy: { externalSpeakerId: "asc" },
    });

    if (!transcript) {
      return {
        jobId,
        jobStatus: job.status,
        transcript: null,
        speakers: speakers.map((s) => ({
          ...s,
          emotionProfile: s.emotionProfile ? JSON.parse(s.emotionProfile) : [],
        })),
        segments: [],
      };
    }

    return {
      jobId,
      jobStatus: job.status,
      transcript: {
        id: transcript.id,
        jobId: transcript.jobId,
        language: transcript.language,
        source: transcript.source as TranscriptSource,
        provider: transcript.provider,
        status: transcript.status,
        version: transcript.version,
        createdAt: transcript.createdAt,
        updatedAt: transcript.updatedAt,
      },
      speakers: speakers.map((s) => ({
        id: s.id,
        jobId: s.jobId,
        externalSpeakerId: s.externalSpeakerId,
        displayName: s.displayName,
        estimatedAgeGroup: s.estimatedAgeGroup,
        apparentGender: s.apparentGender,
        roleHint: s.roleHint,
        emotionProfile: s.emotionProfile ? JSON.parse(s.emotionProfile) : [],
        appearanceCount: s.appearanceCount,
        isEstimated: s.isEstimated,
      })),
      segments: transcript.segments.map((seg) => ({
        id: seg.id,
        transcriptId: seg.transcriptId,
        speakerId: seg.speakerId,
        speakerDisplayName: seg.speaker.displayName,
        externalSpeakerId: seg.speaker.externalSpeakerId,
        segmentIndex: seg.segmentIndex,
        startMs: seg.startMs,
        endMs: seg.endMs,
        sourceText: seg.sourceText,
        originalSourceText: seg.originalSourceText,
        originalSpeakerId: seg.originalSpeakerId,
        confidence: seg.confidence,
        needsReview: seg.needsReview,
        version: seg.version,
        updatedAt: seg.updatedAt,
        revisions: seg.revisions,
      })),
    };
  }

  public async updateSegment(input: UpdateTranscriptSegmentInput) {
    const transcript = await prisma.transcript.findUnique({
      where: { id: input.transcriptId },
      include: { job: true },
    });

    if (!transcript) {
      throw new DomainError(
        404,
        "TRANSCRIPT_NOT_FOUND",
        "Không tìm thấy bản transcript cần chỉnh sửa."
      );
    }

    if (transcript.job.userId !== input.userId) {
      throw new DomainError(
        403,
        "FORBIDDEN_TRANSCRIPT_EDIT",
        "Bạn không có quyền chỉnh sửa transcript của tiến trình này."
      );
    }

    const segment = await prisma.transcriptSegment.findUnique({
      where: { id: input.segmentId },
    });

    if (!segment || segment.transcriptId !== transcript.id) {
      throw new DomainError(
        404,
        "SEGMENT_NOT_FOUND",
        "Không tìm thấy câu thoại cần chỉnh sửa trong transcript này."
      );
    }

    const nextText =
      input.sourceText !== undefined
        ? input.sourceText.trim()
        : segment.sourceText;

    if (!nextText) {
      throw new ValidationDomainError(
        "EMPTY_SEGMENT_TEXT",
        "Nội dung câu thoại không được để trống."
      );
    }

    const nextSpeakerId = input.speakerId ?? segment.speakerId;
    if (input.speakerId && input.speakerId !== segment.speakerId) {
      const targetSpeaker = await prisma.speaker.findUnique({
        where: { id: input.speakerId },
      });
      if (!targetSpeaker || targetSpeaker.jobId !== transcript.jobId) {
        throw new ValidationDomainError(
          "INVALID_SPEAKER_ID",
          "Speaker được chọn không thuộc tiến trình lồng tiếng này."
        );
      }
    }

    const nextSegmentVersion = segment.version + 1;
    const nextNeedsReview =
      input.needsReview !== undefined ? input.needsReview : false;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.transcriptSegmentRevision.create({
        data: {
          segmentId: segment.id,
          transcriptId: transcript.id,
          editedByUserId: input.userId,
          previousText: segment.sourceText,
          newText: nextText,
          previousSpeakerId: segment.speakerId,
          newSpeakerId: nextSpeakerId,
          version: nextSegmentVersion,
        },
      });

      const updatedSeg = await tx.transcriptSegment.update({
        where: { id: segment.id },
        data: {
          sourceText: nextText,
          speakerId: nextSpeakerId,
          needsReview: nextNeedsReview,
          version: nextSegmentVersion,
        },
        include: {
          speaker: true,
          revisions: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });

      await tx.transcript.update({
        where: { id: transcript.id },
        data: {
          version: { increment: 1 },
        },
      });

      // Recompute speaker appearance counts if speaker changed
      if (nextSpeakerId !== segment.speakerId) {
        const oldCount = await tx.transcriptSegment.count({
          where: { transcriptId: transcript.id, speakerId: segment.speakerId },
        });
        const newCount = await tx.transcriptSegment.count({
          where: { transcriptId: transcript.id, speakerId: nextSpeakerId },
        });
        await tx.speaker.update({
          where: { id: segment.speakerId },
          data: { appearanceCount: oldCount },
        });
        await tx.speaker.update({
          where: { id: nextSpeakerId },
          data: { appearanceCount: newCount },
        });
      }

      return updatedSeg;
    });

    return {
      id: updated.id,
      transcriptId: updated.transcriptId,
      speakerId: updated.speakerId,
      speakerDisplayName: updated.speaker.displayName,
      externalSpeakerId: updated.speaker.externalSpeakerId,
      segmentIndex: updated.segmentIndex,
      startMs: updated.startMs,
      endMs: updated.endMs,
      sourceText: updated.sourceText,
      originalSourceText: updated.originalSourceText,
      originalSpeakerId: updated.originalSpeakerId,
      confidence: updated.confidence,
      needsReview: updated.needsReview,
      version: updated.version,
      updatedAt: updated.updatedAt,
      revisions: updated.revisions,
    };
  }
}

export const transcriptVersionService = new TranscriptVersionService();
